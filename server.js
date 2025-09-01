const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsExists = require('fs').existsSync;
const app = express();
const PORT = process.env.PORT || 3000;
const baseUploadDir = path.join(__dirname, 'uploads');

// 定义文件类型分类和对应的目录
const fileCategories = {
    images: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/webp'],
    videos: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'],
    codes: [
        'text/javascript', 'application/javascript', 
        'text/python', 'application/python',
        'text/php', 'application/php',
        'text/java', 'application/java',
        'text/c', 'text/c++', 'application/c', 'application/c++',
        'text/ruby', 'application/ruby',
        'text/go', 'application/go',
        'text/typescript', 'application/typescript'
    ],
    documents: [
        'text/plain', 'text/markdown',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/rtf', 'application/vnd.oasis.opendocument.text'
    ]
};

// 定义扩展名分类型的映射（用于MIME类型无法识别时的 fallback）
const extensionToCategory = {
    // 图片
    '.jpg': 'images', '.jpeg': 'images', '.png': 'images', '.gif': 'images', 
    '.bmp': 'images', '.svg': 'images', '.webp': 'images',
    // 视频
    '.mp4': 'videos', '.mpeg': 'videos', '.mov': 'videos', '.avi': 'videos', '.mkv': 'videos',
    // 代码
    '.js': 'codes', '.py': 'codes', '.php': 'codes', '.java': 'codes', 
    '.c': 'codes', '.cpp': 'codes', '.rb': 'codes', '.go': 'codes', '.ts': 'codes',
    // 文档
    '.txt': 'documents', '.md': 'documents', '.pdf': 'documents',
    '.doc': 'documents', '.docx': 'documents',
    '.ppt': 'documents', '.pptx': 'documents',
    '.xls': 'documents', '.xlsx': 'documents',
    '.rtf': 'documents', '.odt': 'documents'
};

// 确保所有目录存在
async function ensureDirectories() {
    const categories = Object.keys(fileCategories);
    for (const category of categories) {
        const dir = path.join(baseUploadDir, category);
        if (!fsExists(dir)) {
            await fs.mkdir(dir, { recursive: true });
        }
    }
    // 确保其他文件目录存在
    const otherDir = path.join(baseUploadDir, 'others');
    if (!fsExists(otherDir)) {
        await fs.mkdir(otherDir, { recursive: true });
    }
}

// 初始化目录
ensureDirectories().catch(err => console.error('创建目录失败:', err));

// 确定文件分类
function getFileCategory(mimetype, filename) {
    // 首先尝试通过MIME类型判断
    for (const [category, types] of Object.entries(fileCategories)) {
        if (types.includes(mimetype)) {
            return category;
        }
    }
    
    // 如果MIME类型无法识别，尝试通过扩展名判断
    const ext = path.extname(filename).toLowerCase();
    if (extensionToCategory[ext]) {
        return extensionToCategory[ext];
    }
    
    // 都无法识别则归为其他
    return 'others';
}

// 配置multer存储
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const category = getFileCategory(file.mimetype, file.originalname);
        const destPath = path.join(baseUploadDir, category);
        cb(null, destPath);
    },
    filename: function (req, file, cb) {
        // 使用时间戳和随机数确保文件名唯一
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// 配置multer
const upload = multer({ 
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 限制文件大小为50MB
    }
});

// 解析JSON请求体
app.use(express.json());

// 上传文件接口 - 支持任意类型文件并分类存储
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '没有文件被上传' });
    }
    
    // 获取文件分类
    const category = getFileCategory(req.file.mimetype, req.file.originalname);
    
    // 返回文件信息
    res.json({
        message: '文件上传成功',
        url: `http://your-server-ip/uploads/${category}/${req.file.filename}`,
        filename: req.file.filename,
        category: category,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
    });
});

// 删除文件接口
app.delete('/delete', async (req, res) => {
    const { filename, category } = req.body;
    
    if (!filename || !category) {
        return res.status(400).json({ error: '请提供要删除的文件名和分类' });
    }
    
    // 验证分类是否有效
    const validCategories = [...Object.keys(fileCategories), 'others'];
    if (!validCategories.includes(category)) {
        return res.status(400).json({ error: '无效的文件分类' });
    }
    
    const filePath = path.join(baseUploadDir, category, filename);
    
    try {
        // 检查文件是否存在
        await fs.access(filePath);
        
        // 删除文件
        await fs.unlink(filePath);
        
        res.json({ message: '文件删除成功', filename, category });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({ error: '文件不存在', filename, category });
        }
        console.error('删除文件失败:', err);
        res.status(500).json({ error: '删除文件时发生错误' });
    }
});

// 提供分类目录的静态访问
app.use('/uploads', express.static(baseUploadDir, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        // 设置常见文件类型的Content-Type
        const mimeTypes = {
            '.json': 'application/json',
            '.pdf': 'application/pdf',
            '.zip': 'application/zip',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo'
        };
        
        if (mimeTypes[ext]) {
            res.setHeader('Content-Type', mimeTypes[ext]);
        }
    }
}));

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: '文件大小超过限制（最大50MB）' });
    }
    res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`文件存储根目录: ${baseUploadDir}`);
});
    
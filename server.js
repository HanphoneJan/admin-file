const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsExists = require('fs').existsSync;
const app = express();
const PORT = process.env.PORT || 4000;
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
    '.html': 'codes', '.css': 'codes', '.js': 'codes', '.tsx': 'codes', '.vue': 'codes',
    // 文档
    '.txt': 'documents', '.md': 'documents', '.pdf': 'documents',
    '.doc': 'documents', '.docx': 'documents',
    '.ppt': 'documents', '.pptx': 'documents',
    '.xls': 'documents', '.xlsx': 'documents',
    '.rtf': 'documents', '.odt': 'documents'
};

// 确保目录存在
async function ensureDirectory(dirPath) {
    if (!fsExists(dirPath)) {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

// 初始化基础目录
ensureDirectory(baseUploadDir).catch(err => console.error('创建基础目录失败:', err));

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

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// 获取完整的文件存储路径
function getFullStoragePath(namespace, category) {
    // 如果提供了命名空间，则在基础目录下创建对应子目录
    if (namespace) {
        return path.join(baseUploadDir, namespace, category);
    }
    // 否则使用默认路径
    return path.join(baseUploadDir, category);
}

// 配置multer存储
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        try {
            // 从请求中获取命名空间（可选参数）
            const namespace = req.body.namespace || req.query.namespace;
            const category = getFileCategory(file.mimetype, file.originalname);
            const destPath = getFullStoragePath(namespace, category);

            // 确保目录存在
            await ensureDirectory(destPath);
            cb(null, destPath);
        } catch (err) {
            cb(err);
        }
    },
    filename: async function (req, file, cb) {
        try {
            // 获取命名空间
            const namespace = req.body.namespace || req.query.namespace;
            const category = getFileCategory(file.mimetype, file.originalname);
            const destPath = getFullStoragePath(namespace, category);
            const originalName = file.originalname;
            const ext = path.extname(originalName);
            const nameWithoutExt = path.basename(originalName, ext);

            console.log(`上传文件: ${originalName}, 命名空间: ${namespace || '默认'}, 分类: ${category}, 存储路径: ${destPath}`);

            // 先检查原文件名是否存在
            let filePath = path.join(destPath, originalName);
            let exists = await fileExists(filePath);

            // 如果不存在，直接使用原文件名
            console.log(`文件存在检查: ${filePath} - ${exists ? '存在' : '不存在'}`);
            if (!exists) {
                return cb(null, originalName);
            }

            // 如果存在，添加时间戳后缀
            const timestamp = Date.now();
            const uniqueName = `${nameWithoutExt}-${timestamp}${ext}`;
            cb(null, uniqueName);
        } catch (err) {
            // 出错时使用原始的随机命名方式作为备份
            console.error('生成文件名时出错:', err);
            const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        }
    }
});

// 配置multer
const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 限制文件大小为50MB
    }
});

// 解析JSON和表单数据请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 上传文件接口 - 支持任意类型文件并分类存储，可指定命名空间
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '没有文件被上传' });
    }

    // 获取命名空间和文件分类
    const namespace = req.body.namespace || req.query.namespace;
    const category = getFileCategory(req.file.mimetype, req.file.originalname);

    // 构建URL路径（不包含uploads）
    let urlPath = '';
    if (namespace) {
        urlPath += `${namespace}/`;
    }
    urlPath += `${category}/${req.file.filename}`;

    // 返回文件信息
    res.json({
        message: '文件上传成功',
        url: `https://hanphone.top/${urlPath}`,  // URL中不再有uploads
        filename: req.file.filename,
        category: category,
        namespace: namespace || 'default',
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
    });
});

// 删除文件接口 - 支持指定命名空间
app.delete('/delete', async (req, res) => {
    const { filename, category, namespace } = req.body;

    if (!filename || !category) {
        return res.status(400).json({ error: '请提供要删除的文件名和分类' });
    }

    // 验证分类是否有效
    const validCategories = [...Object.keys(fileCategories), 'others'];
    if (!validCategories.includes(category)) {
        return res.status(400).json({ error: '无效的文件分类' });
    }

    // 构建文件路径
    const filePath = getFullStoragePath(namespace, category) + path.sep + filename;

    try {
        // 检查文件是否存在
        await fs.access(filePath);

        // 删除文件
        await fs.unlink(filePath);

        res.json({
            message: '文件删除成功',
            filename,
            category,
            namespace: namespace || 'default'
        });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({
                error: '文件不存在',
                filename,
                category,
                namespace: namespace || 'default'
            });
        }
        console.error('删除文件失败:', err);
        res.status(500).json({ error: '删除文件时发生错误' });
    }
});

// 提供文件的静态访问，URL中不再包含uploads
// 关键修改：将静态服务挂载到根路径 '/' 而不是 '/uploads'
app.use('/', express.static(baseUploadDir, {
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

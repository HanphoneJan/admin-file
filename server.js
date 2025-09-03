const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsExists = require('fs').existsSync;
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 4000;
const baseUploadDir = path.join(__dirname, 'uploads');

// 配置CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Token']
}));

app.options('/*all', cors());

// 文件类型分类
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

// 扩展名分类型映射
const extensionToCategory = {
    '.jpg': 'images', '.jpeg': 'images', '.png': 'images', '.gif': 'images',
    '.bmp': 'images', '.svg': 'images', '.webp': 'images',
    '.mp4': 'videos', '.mpeg': 'videos', '.mov': 'videos', '.avi': 'videos', '.mkv': 'videos',
    '.js': 'codes', '.py': 'codes', '.php': 'codes', '.java': 'codes',
    '.c': 'codes', '.cpp': 'codes', '.rb': 'codes', '.go': 'codes', '.ts': 'codes',
    '.html': 'codes', '.css': 'codes', '.js': 'codes', '.tsx': 'codes', '.vue': 'codes',
    '.txt': 'documents', '.md': 'documents', '.pdf': 'documents',
    '.doc': 'documents', '.docx': 'documents',
    '.ppt': 'documents', '.pptx': 'documents',
    '.xls': 'documents', '.xlsx': 'documents',
    '.rtf': 'documents', '.odt': 'documents'
};

/**
 * 确保目录存在，如果不存在则创建
 * @param {string} dirPath - 目录路径
 */
async function ensureDirectoryExists(dirPath) {
    try {
        if (!fsExists(dirPath)) {
            console.log(`目录不存在，正在创建: ${dirPath}`);
            await fs.mkdir(dirPath, { recursive: true });
            console.log(`目录创建成功: ${dirPath}`);
        }
    } catch (err) {
        console.error(`创建目录失败 ${dirPath}:`, err);
        throw err;
    }
}

// 初始化基础上传目录
ensureDirectoryExists(baseUploadDir)
    .then(() => console.log(`基础上传目录准备就绪: ${baseUploadDir}`))
    .catch(err => console.error('初始化基础目录失败:', err));

// 确定文件分类
function getFileCategory(mimetype, filename) {
    for (const [category, types] of Object.entries(fileCategories)) {
        if (types.includes(mimetype)) {
            return category;
        }
    }

    const ext = path.extname(filename).toLowerCase();
    if (extensionToCategory[ext]) {
        return extensionToCategory[ext];
    }

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
    if (namespace) {
        return path.join(baseUploadDir, namespace);
    } else {
        return path.join(baseUploadDir, category);
    }
}

/**
 * 修复ISO-8859-1编码的中文文件名
 * 将ISO-8859-1编码的字符串转换为UTF-8
 */
function fixFileNameEncoding(originalName) {
    try {
        // 检查是否是ISO-8859-1编码的中文乱码
        // 将字符串按ISO-8859-1解码，再按UTF-8编码
        return Buffer.from(originalName, 'latin1').toString('utf8');
    } catch (err) {
        console.error('文件名编码转换失败:', err);
        return originalName; // 转换失败时返回原始名称
    }
}

// 配置multer存储
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        try {
            const namespace = req.body.namespace || req.query.namespace;
            // 修复文件名编码后再获取分类
            const fixedName = fixFileNameEncoding(file.originalname);
            const category = getFileCategory(file.mimetype, fixedName);
            const destPath = getFullStoragePath(namespace, category);

            await ensureDirectoryExists(destPath);
            cb(null, destPath);
        } catch (err) {
            console.error('设置文件存储目录失败:', err);
            cb(err);
        }
    },
    filename: async function (req, file, cb) {
        try {
            const namespace = req.body.namespace || req.query.namespace;
            // 关键修复：将ISO-8859-1编码的文件名转换为UTF-8
            const originalName = fixFileNameEncoding(file.originalname);
            const category = getFileCategory(file.mimetype, originalName);
            const destPath = getFullStoragePath(namespace, category);

            const ext = path.extname(originalName);
            const nameWithoutExt = path.basename(originalName, ext);

            console.log(`上传文件: ${originalName}, 命名空间: ${namespace || '默认'}, ${namespace ? '' : `分类: ${category}`}`);

            // 检查原文件名是否存在
            let filePath = path.join(destPath, originalName);
            let exists = await fileExists(filePath);

            if (!exists) {
                return cb(null, originalName);
            }

            // 文件名存在时添加时间戳
            const timestamp = Date.now();
            const uniqueName = `${nameWithoutExt}-${timestamp}${ext}`;
            cb(null, uniqueName);
        } catch (err) {
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
        fileSize: 50 * 1024 * 1024 // 50MB
    }
});

// 解析请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 上传文件接口
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '没有文件被上传' });
    }

    const namespace = req.body.namespace || req.query.namespace;
    const fixedName = fixFileNameEncoding(req.file.originalname);
    const category = getFileCategory(req.file.mimetype, fixedName);

    let urlPath = '';
    if (namespace) {
        const encodedNamespace = encodeURIComponent(namespace);
        const encodedFilename = encodeURIComponent(req.file.filename);
        urlPath = `${encodedNamespace}/${encodedFilename}`;
    } else {
        const encodedCategory = encodeURIComponent(category);
        const encodedFilename = encodeURIComponent(req.file.filename);
        urlPath = `${encodedCategory}/${encodedFilename}`;
    }

    res.json({
        code: 200,
        message: '文件上传成功',
        url: `https://hanphone.top/${urlPath}`,
        filename: req.file.filename,
        category: namespace ? null : category,
        namespace: namespace || 'default',
        originalName: fixedName, // 返回修复编码后的原始文件名
        mimetype: req.file.mimetype,
        size: req.file.size
    });
});

// 删除文件接口
app.delete('/delete', async (req, res) => {
    const { filename, namespace } = req.body;
    const { category } = req.body;

    if (!filename) {
        return res.status(400).json({ error: '请提供要删除的文件名' });
    }

    if (!namespace && !category) {
        return res.status(400).json({ error: '无命名空间时请提供文件分类' });
    }

    if (!namespace) {
        const validCategories = [...Object.keys(fileCategories), 'others'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({ error: '无效的文件分类' });
        }
    }

    const filePath = path.join(getFullStoragePath(namespace, category), filename);

    try {
        await fs.access(filePath);
        await fs.unlink(filePath);

        res.json({
            code: 200,
            message: '文件删除成功',
            filename,
            category: namespace ? null : category,
            namespace: namespace || 'default'
        });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({
                error: '文件不存在',
                filename,
                category: namespace ? null : category,
                namespace: namespace || 'default'
            });
        }
        console.error('删除文件失败:', err);
        res.status(500).json({ error: '删除文件时发生错误' });
    }
});

// 提供文件静态访问
app.use('/', express.static(baseUploadDir, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
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

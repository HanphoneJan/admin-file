const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsExists = require('fs').existsSync;
// 引入cors中间件
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 4000;
const baseUploadDir = path.join(__dirname, 'uploads');

// 配置CORS，允许所有来源的跨域请求
// 生产环境中建议限制具体的origin
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], // 允许的HTTP方法
    allowedHeaders: ['Content-Type', 'Authorization','Token'] // 允许的请求头
}));

// 修正：预检请求通配符必须命名（将*改为/*all，all为自定义参数名）
app.options('/*all', cors());

// 定义文件类型分类（仅用于无命名空间时）
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

// 定义扩展名分类型的映射（用于MIME类型无法识别时的 fallback，仅用于无命名空间时）
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
        throw err; // 抛出错误以便上层处理
    }
}

// 初始化基础上传目录
ensureDirectoryExists(baseUploadDir)
    .then(() => console.log(`基础上传目录准备就绪: ${baseUploadDir}`))
    .catch(err => console.error('初始化基础目录失败:', err));

// 确定文件分类（仅用于无命名空间时）
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
// 当指定命名空间时，文件直接存储在命名空间目录下，不创建分类子目录
// 当不指定命名空间时，使用分类目录
function getFullStoragePath(namespace, category) {
    if (namespace) {
        // 有命名空间：基础目录/命名空间
        return path.join(baseUploadDir, namespace);
    } else {
        // 无命名空间：基础目录/分类
        return path.join(baseUploadDir, category);
    }
}

// 配置multer存储
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        try {
            // 从请求中获取命名空间（可选参数）
            const namespace = req.body.namespace || req.query.namespace;
            // 获取分类（仅用于无命名空间时）
            const category = getFileCategory(file.mimetype, file.originalname);
            const destPath = getFullStoragePath(namespace, category);

            // 确保目标目录存在
            await ensureDirectoryExists(destPath);

            cb(null, destPath);
        } catch (err) {
            console.error('设置文件存储目录失败:', err);
            cb(err);
        }
    },
    filename: async function (req, file, cb) {
        try {
            // 获取命名空间
            const namespace = req.body.namespace || req.query.namespace;
            // 获取分类（仅用于无命名空间时）
            const category = getFileCategory(file.mimetype, file.originalname);
            const destPath = getFullStoragePath(namespace, category);
            const originalName = file.originalname;
            const ext = path.extname(originalName);
            const nameWithoutExt = path.basename(originalName, ext);

            console.log(`上传文件: ${originalName}, 命名空间: ${namespace || '默认'}, ${namespace ? '' : `分类: ${category}`}`);

            // 先检查原文件名是否存在
            let filePath = path.join(destPath, originalName);
            let exists = await fileExists(filePath);

            // 如果不存在，直接使用原文件名
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

// 上传文件接口
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '没有文件被上传' });
    }

    // 获取命名空间和文件分类（分类仅用于无命名空间时）
    const namespace = req.body.namespace || req.query.namespace;
    const category = getFileCategory(req.file.mimetype, req.file.originalname);

    // 构建URL路径
    let urlPath = '';
    if (namespace) {
        // 1. 对命名空间编码（处理特殊字符如空格、中文）
        const encodedNamespace = encodeURIComponent(namespace);
        // 2. 对文件名编码（核心：处理中文/特殊符号文件名）
        const encodedFilename = encodeURIComponent(req.file.filename);
        // 3. 拼接编码后的路径片段
        urlPath = `${encodedNamespace}/${encodedFilename}`;
    } else {
        // 1. 对分类编码（虽分类通常是英文，但兼容特殊字符场景）
        const encodedCategory = encodeURIComponent(category);
        // 2. 对文件名编码
        const encodedFilename = encodeURIComponent(req.file.filename);
        // 3. 拼接编码后的路径片段
        urlPath = `${encodedCategory}/${encodedFilename}`;
    }

    // 返回文件信息
    res.json({
        code:200,
        message: '文件上传成功',
        url: `https://hanphone.top/${urlPath}`,
        filename: req.file.filename,
        category: namespace ? null : category, // 有命名空间时不返回分类
        namespace: namespace || 'default',
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
    });
});

// 删除文件接口
app.delete('/delete', async (req, res) => {
    const { filename, namespace } = req.body;
    // 分类仅用于无命名空间时
    const { category } = req.body;

    if (!filename) {
        return res.status(400).json({ error: '请提供要删除的文件名' });
    }

    // 无命名空间时必须提供分类
    if (!namespace && !category) {
        return res.status(400).json({ error: '无命名空间时请提供文件分类' });
    }

    // 验证分类是否有效（仅用于无命名空间时）
    if (!namespace) {
        const validCategories = [...Object.keys(fileCategories), 'others'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({ error: '无效的文件分类' });
        }
    }

    // 构建文件路径
    const filePath = path.join(getFullStoragePath(namespace, category), filename);

    try {
        // 检查文件是否存在
        await fs.access(filePath);

        // 删除文件
        await fs.unlink(filePath);

        res.json({
            code:200,
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

// 提供文件的静态访问
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
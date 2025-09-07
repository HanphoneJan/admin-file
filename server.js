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
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'PUT'],
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
// 合并删除文件与目录的接口
app.delete('/delete', async (req, res) => {
    try {
        const { name, namespace, category, parentNamespace } = req.body;

        if (!name) {
            return res.status(400).json({ error: '请提供要删除的名称' });
        }

        // 确定目标路径
        let targetPath;
        if (namespace) {
            // 命名空间模式
            targetPath = path.join(baseUploadDir, namespace, name);
        } else if (category) {
            // 分类模式
            targetPath = path.join(baseUploadDir, category, name);
        } else if (parentNamespace) {
            // 父命名空间下的目录
            targetPath = path.join(baseUploadDir, parentNamespace, name);
        } else {
            // 根目录下的项目
            targetPath = path.join(baseUploadDir, name);
        }

        // 检查目标是否存在
        if (!await fileExists(targetPath)) {
            return res.status(404).json({
                error: '目标不存在',
                name,
                namespace,
                category,
                parentNamespace
            });
        }

        // 获取目标信息
        const stats = await fs.stat(targetPath);

        // 判断是文件还是目录并执行删除
        if (stats.isFile()) {
            // 删除文件
            await fs.unlink(targetPath);
            res.json({
                code: 200,
                message: '文件删除成功',
                type: 'file',
                name,
                namespace: namespace || parentNamespace || null,
                category: category || null
            });
        } else if (stats.isDirectory()) {
            // 检查目录是否为空
            const items = await fs.readdir(targetPath);
            if (items.length > 0) {
                return res.status(400).json({
                    error: '目录不为空，无法删除',
                    type: 'directory',
                    name,
                    namespace: namespace || parentNamespace || null,
                    category: category || null,
                    itemCount: items.length
                });
            }

            // 删除目录
            await fs.rmdir(targetPath);
            res.json({
                code: 200,
                message: '目录删除成功',
                type: 'directory',
                name,
                namespace: namespace || parentNamespace || null,
                category: category || null
            });
        }
    } catch (err) {
        console.error('删除操作失败:', err);
        res.status(500).json({ error: '删除时发生错误' });
    }
});

// 获取文件列表接口
// 获取文件列表接口
app.get('/files', async (req, res) => {
    try {
        const { namespace, category } = req.query;

        if (!namespace && !category) {
            // 获取所有命名空间和分类，包含大小和日期信息
            const items = await fs.readdir(baseUploadDir, { withFileTypes: true });
            const result = [];

            for (const item of items) {
                const itemPath = path.join(baseUploadDir, item.name);
                const stats = await fs.stat(itemPath);

                result.push({
                    name: item.name,
                    isDirectory: item.isDirectory(),
                    type: item.isDirectory() ? 'namespace' : 'file',
                    size: stats.size,         // 添加大小信息
                    mtime: stats.mtime,       // 添加最后修改时间
                    birthtime: stats.birthtime // 添加创建时间
                });
            }

            return res.json({
                code: 200,
                message: '获取根目录内容成功',
                items: result
            });
        }

        const targetDir = getFullStoragePath(namespace, category);

        // 检查目录是否存在
        if (!await fileExists(targetDir)) {
            return res.status(404).json({
                error: '目录不存在',
                namespace,
                category
            });
        }

        // 读取目录内容，包含目录本身的大小信息
        const items = await fs.readdir(targetDir, { withFileTypes: true });
        const fileItems = [];

        // 获取目录自身的统计信息
        const dirStats = await fs.stat(targetDir);

        for (const item of items) {
            const itemPath = path.join(targetDir, item.name);
            const stats = await fs.stat(itemPath);

            fileItems.push({
                name: item.name,
                isDirectory: item.isDirectory(),
                size: stats.size,
                mtime: stats.mtime, // 最后修改时间
                birthtime: stats.birthtime, // 创建时间
                category: !namespace ? category : null,
                namespace: namespace || null
            });
        }

        res.json({
            code: 200,
            message: '获取文件列表成功',
            items: fileItems,
            // 添加目录自身的信息
            directoryInfo: {
                name: namespace || category,
                size: dirStats.size,
                mtime: dirStats.mtime,
                birthtime: dirStats.birthtime
            },
            namespace,
            category
        });
    } catch (err) {
        console.error('获取文件列表失败:', err);
        res.status(500).json({ error: '获取文件列表时发生错误' });
    }
});
// 获取文件详情接口
app.get('/file', async (req, res) => {
    try {
        const { filename, namespace, category } = req.query;

        if (!filename) {
            return res.status(400).json({ error: '请提供文件名' });
        }

        if (!namespace && !category) {
            return res.status(400).json({ error: '请提供命名空间或分类' });
        }

        const targetDir = getFullStoragePath(namespace, category);
        const filePath = path.join(targetDir, filename);

        // 检查文件是否存在
        if (!await fileExists(filePath)) {
            return res.status(404).json({
                error: '文件不存在',
                filename,
                namespace,
                category
            });
        }

        // 获取文件信息
        const stats = await fs.stat(filePath);
        const ext = path.extname(filename).toLowerCase();
        let fileCategory = getFileCategory('', filename);

        let urlPath = '';
        if (namespace) {
            const encodedNamespace = encodeURIComponent(namespace);
            const encodedFilename = encodeURIComponent(filename);
            urlPath = `${encodedNamespace}/${encodedFilename}`;
        } else {
            const encodedCategory = encodeURIComponent(category);
            const encodedFilename = encodeURIComponent(filename);
            urlPath = `${encodedCategory}/${encodedFilename}`;
        }

        res.json({
            code: 200,
            message: '获取文件详情成功',
            file: {
                name: filename,
                originalName: filename, // 这里可以根据需要修改为实际原始名称
                size: stats.size,
                mtime: stats.mtime,
                birthtime: stats.birthtime,
                extension: ext,
                category: fileCategory,
                namespace: namespace || null,
                url: `https://hanphone.top/${urlPath}`,
                mimetype: extensionToCategory[ext] ?
                    `${extensionToCategory[ext]}/${ext.substring(1)}` :
                    'application/octet-stream'
            }
        });
    } catch (err) {
        console.error('获取文件详情失败:', err);
        res.status(500).json({ error: '获取文件详情时发生错误' });
    }
});

// 创建目录接口
app.post('/directory', async (req, res) => {
    try {
        const { name, parentNamespace } = req.body;

        if (!name) {
            return res.status(400).json({ error: '请提供目录名称' });
        }

        // 确定父目录
        let parentDir = baseUploadDir;
        if (parentNamespace) {
            parentDir = path.join(baseUploadDir, parentNamespace);
            // 检查父命名空间是否存在
            if (!await fileExists(parentDir)) {
                return res.status(404).json({
                    error: '父命名空间不存在',
                    parentNamespace
                });
            }
        }

        const newDirPath = path.join(parentDir, name);

        // 检查目录是否已存在
        if (await fileExists(newDirPath)) {
            return res.status(409).json({
                error: '目录已存在',
                directoryName: name,
                parentNamespace
            });
        }

        // 创建目录
        await fs.mkdir(newDirPath, { recursive: true });

        res.json({
            code: 200,
            message: '目录创建成功',
            directoryName: name,
            parentNamespace,
            path: newDirPath
        });
    } catch (err) {
        console.error('创建目录失败:', err);
        res.status(500).json({ error: '创建目录时发生错误' });
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
        // 设置Content-Disposition触发下载
        // 从文件路径中提取文件名
        const fileName = path.basename(filePath);
        // 对文件名进行编码以支持特殊字符
        const encodedFileName = encodeURIComponent(fileName);
        res.setHeader('Content-Disposition', `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`);
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
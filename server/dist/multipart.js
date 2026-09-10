// multipart/form-data parsing using busboy.
import busboy from 'busboy';
export async function parseMultipart(req, buf) {
    return new Promise((resolve, reject) => {
        const bb = busboy({ headers: req.headers });
        const fields = {};
        const files = [];
        bb.on('field', (name, val) => {
            if (fields[name] === undefined)
                fields[name] = val;
            else if (Array.isArray(fields[name]))
                fields[name].push(val);
            else
                fields[name] = [fields[name], val];
        });
        bb.on('file', (name, stream, info) => {
            const chunks = [];
            stream.on('data', (d) => chunks.push(d));
            stream.on('end', () => {
                files.push({
                    field: name,
                    name: info.filename,
                    mime: info.mimeType,
                    buffer: Buffer.concat(chunks),
                });
            });
        });
        bb.on('error', reject);
        bb.on('close', () => resolve({ fields, files }));
        bb.end(buf);
    });
}
//# sourceMappingURL=multipart.js.map
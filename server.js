require('dotenv').config();

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const csvtojson = require('csvtojson');
const { Builder } = require('xml2js');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = 6000;

const CSV_DIR = path.join(__dirname, 'csv');
const XML_DIR = path.join(__dirname, 'xml');
const XML_FILE = path.join(XML_DIR, 'last.xml');

// Ensure directories exist
[CSV_DIR, XML_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

const upload = multer({ dest: CSV_DIR });

app.post('/receive', upload.single('csvfile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No CSV file provided.' });
    }

    try {
        const csvPath = req.file.path;
        const csvFilename = req.file.originalname;
        const savedCsvPath = path.join(CSV_DIR, csvFilename);

        fs.renameSync(csvPath, savedCsvPath);

        const jsonArray = await csvtojson().fromFile(savedCsvPath);
        const builder = new Builder();
        const xml = builder.buildObject({ root: { row: jsonArray } });

        fs.writeFileSync(XML_FILE, xml);

        // Get Spring Boot service host and port from environment variables
        const springHost = process.env.SPRING_SERVICE_HOST || 'localhost';
        const springPort = process.env.SPRING_SERVICE_PORT || '6001';
        const url = `http://${springHost}:${springPort}/tojson`;

        const form = new FormData();
        form.append('file', fs.createReadStream(XML_FILE), { filename: 'data.xml', contentType: 'application/xml' });

        const response = await axios.post(url, form, {
            headers: form.getHeaders(),
        });

        res.status(200).json({ 
            message: 'CSV received, converted to XML, and sent to Spring Boot service.', 
            springServiceStatus: response.status 
        });
    } catch (err) {
        console.error('Error processing file:', err.message);
        res.status(500).json({ error: 'Error processing file.', details: err.message });
    }
});

app.get('/view', (req, res) => {
    if (!fs.existsSync(XML_FILE)) {
        return res.status(404).send('No XML file found.');
    }
    const xmlContent = fs.readFileSync(XML_FILE, 'utf-8');
    res.type('application/xml').send(xmlContent);
});

app.listen(PORT, () => {
    console.log(`Node.js server running on port ${PORT}`);
});

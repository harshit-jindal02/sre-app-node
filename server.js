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

// Multer setup for file uploads
const upload = multer({ dest: CSV_DIR });

app.post('/receive', upload.single('csvfile'), async (req, res) => {
    try {
        const csvPath = req.file.path;
        const csvFilename = req.file.originalname;
        const savedCsvPath = path.join(CSV_DIR, csvFilename);

        // Rename file to original name
        fs.renameSync(csvPath, savedCsvPath);

        // Convert CSV to JSON
        const jsonArray = await csvtojson().fromFile(savedCsvPath);

        // Convert JSON to XML
        const builder = new Builder();
        const xml = builder.buildObject({ root: { row: jsonArray } });

        // Save XML to file
        fs.writeFileSync(XML_FILE, xml);

        // Send XML to another server as multipart/form-data
        const targetServer = process.env.TARGET_SERVER || 'localhost';
        const url = `http://${targetServer}:6001/tojson`;

        const form = new FormData();
        form.append('file', fs.createReadStream(XML_FILE)); // field name must be "file"

        const response = await axios.post(url, form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity
        });

        res.status(200).json({ message: 'CSV received, converted, XML sent.', xmlSentStatus: response.status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error processing file.' });
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
    console.log(`Server running on port ${PORT}`);
});

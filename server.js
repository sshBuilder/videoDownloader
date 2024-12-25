// server.js

require('dotenv').config(); // Load environment variables

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const app = express();
const port = process.env.PORT || 3000;

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many download requests from this IP, please try again later.'
});

// Apply rate limiting to all requests
app.use(limiter);

// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to validate URLs
const validDomains = ['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com'];

function isValidUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return validDomains.includes(parsedUrl.hostname.replace('www.', ''));
    } catch (e) {
        return false;
    }
}

// Route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint to handle video download
app.post('/download', (req, res) => {
    const videoUrl = req.body.videoUrl;

    if (!videoUrl) {
        console.error('No video URL provided.');
        return res.status(400).send('No video URL provided.');
    }

    // Sanitize and validate the URL
    const sanitizedUrl = videoUrl.trim();

    if (!isValidUrl(sanitizedUrl)) {
        console.error('Invalid video URL provided.');
        return res.status(400).send('Invalid video URL provided.');
    }

    // Path to yt-dlp executable
    const ytDlpPath = path.join(__dirname, 'files', 'yt-dlp');

    // Check if yt-dlp executable exists
    if (!fs.existsSync(ytDlpPath)) {
        console.error(`yt-dlp executable not found at ${ytDlpPath}`);
        return res.status(500).send('yt-dlp executable not found.');
    }

    console.log(`Starting download for URL: ${sanitizedUrl}`);

    // Spawn the yt-dlp process
    const ytDlp = spawn(ytDlpPath, [
        sanitizedUrl,
        '-f', 'best',    // Select the best available format
        '-o', '-',        // Output to stdout
        '--no-part',      // Do not create .part files
        '--quiet',        // Suppress output
        '--no-warnings'   // Suppress warnings
    ]);

    let videoTitle = 'downloaded_video';
    let contentType = 'application/octet-stream'; // Default content type

    let hasData = false;

    // Capture stderr to check for errors and extract video title
    ytDlp.stderr.on('data', (data) => {
        const message = data.toString();
        console.error(`yt-dlp stderr: ${message}`);

        // Attempt to extract the video title from stderr
        const titleMatch = message.match(/title\s+:\s+(.*)/i);
        if (titleMatch && titleMatch[1]) {
            videoTitle = titleMatch[1].replace(/[<>:"/\\|?*]+/g, ''); // Remove illegal characters
            console.log(`Extracted video title: ${videoTitle}`);
        }

        // Optionally, extract content type if available
        const formatMatch = message.match(/format\s+:\s+(\S+)/i);
        if (formatMatch && formatMatch[1]) {
            const format = formatMatch[1];
            // Simple mapping based on format
            if (format.includes('mp4')) {
                contentType = 'video/mp4';
            } else if (format.includes('webm')) {
                contentType = 'video/webm';
            }
            console.log(`Detected content type: ${contentType}`);
        }
    });

    ytDlp.on('error', (error) => {
        console.error(`Error spawning yt-dlp: ${error.message}`);
        if (!res.headersSent) {
            res.status(500).send('An error occurred while downloading the video.');
        }
    });

    ytDlp.on('close', (code) => {
        if (code !== 0) {
            console.error(`yt-dlp exited with code ${code}`);
            if (!res.headersSent) {
                res.status(500).send('An error occurred while downloading the video.');
            }
        } else {
            console.log('yt-dlp process completed successfully.');
        }
    });

    // Set headers to prompt download in the browser
    res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
    res.setHeader('Content-Type', contentType);

    // Capture stdout data
    ytDlp.stdout.on('data', (data) => {
        hasData = true;
        console.log(`Received ${data.length} bytes of data.`);
    });

    // Pipe yt-dlp stdout directly to the response
    ytDlp.stdout.pipe(res);

    // Handle client disconnect
    req.on('close', () => {
        ytDlp.kill('SIGINT');
        console.log('Client disconnected, killed yt-dlp process.');
    });

    // Handle response finish
    res.on('finish', () => {
        if (!hasData) {
            console.error('No data was piped to the response.');
        } else {
            console.log('Download completed and response finished.');
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

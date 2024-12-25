#!/bin/bash

# download-yt-dlp.sh

# Define the yt-dlp download URL for Linux
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"

# Define the directory to store yt-dlp
FILES_DIR="files"
YTDLP_PATH="$FILES_DIR/yt-dlp"

# Create the files directory if it doesn't exist
mkdir -p $FILES_DIR

# Download yt-dlp
curl -L $YTDLP_URL -o $YTDLP_PATH

# Make yt-dlp executable
chmod +x $YTDLP_PATH

echo "yt-dlp has been downloaded and made executable."

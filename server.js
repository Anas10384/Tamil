const fs = require('fs');
const path = require('path');
const https = require('https');

const channelName = 'tamil';
const streamURL = 'https://ts-j8bh.onrender.com/box.ts?id=4';

const segmentDuration = 5;       // seconds per .ts file
const maxSegments = 60;          // 5 minutes = 60 x 5s
const streamName = 'streamname'; // Base name
const outputDir = path.join(__dirname, 'channels', channelName);

let segmentIndex = 1;
let segmentList = [];

function ensureDir() {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
}

function downloadSegment(index, callback) {
  const filename = `${streamName}.${index}.ts`;
  const filepath = path.join(outputDir, filename);

  const file = fs.createWriteStream(filepath);
  const request = https.get(streamURL, res => {
    res.pipe(file);
    file.on('finish', () => file.close(() => callback(null, filename)));
  });

  request.on('error', err => {
    fs.unlink(filepath, () => {});
    callback(err, null);
  });

  request.setTimeout(6000, () => {
    request.abort();
    callback(new Error("Download timeout"), null);
  });
}

function updateM3U8(segments) {
  const m3u8Path = path.join(outputDir, `${streamName}.m3u8`);
  const sequence = parseInt(segments[0].split('.')[1]);

  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${segmentDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${sequence}`
  ];

  for (const segment of segments) {
    lines.push(`#EXTINF:${segmentDuration}.0,`);
    lines.push(segment);
  }

  fs.writeFileSync(m3u8Path, lines.join('\n'));
}

function rotate() {
  downloadSegment(segmentIndex, (err, filename) => {
    if (err) {
      console.error(`[ERROR] Segment ${segmentIndex}: ${err.message}`);
      return;
    }

    segmentList.push(filename);

    // Keep only last 60 segments (5 minutes)
    while (segmentList.length > maxSegments) {
      const old = segmentList.shift();
      const oldPath = path.join(outputDir, old);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      console.log(`[tamil] Deleted old segment: ${old}`);
    }

    updateM3U8([...segmentList]);
    console.log(`[tamil] Added: ${filename}`);
    segmentIndex++;
  });
}

function preloadAndStart() {
  ensureDir();
  console.log(`[tamil] Preloading 5 minutes of segments...`);

  (async () => {
    for (let i = 0; i < maxSegments; i++) {
      await new Promise(resolve => {
        downloadSegment(segmentIndex++, (err, filename) => {
          if (!err) segmentList.push(filename);
          resolve();
        });
      });
    }

    updateM3U8([...segmentList]);
    console.log(`[tamil] Preload complete. Starting stream...`);
    setInterval(rotate, segmentDuration * 1000);
  })();
}

preloadAndStart();

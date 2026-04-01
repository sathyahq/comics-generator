'use strict';

const express = require('express');
const { generateDialogue } = require('./src/dialogue');
const { renderComic }      = require('./src/renderer');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/generate', async (req, res) => {
  const topic = (req.body.topic || '').trim();
  if (!topic) {
    return res.status(400).send('topic is required');
  }
  try {
    const comicData = await generateDialogue(topic);
    const buffer    = renderComic(comicData.panels, topic);
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).send(err.message || 'Failed to generate comic');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Comic generator running → http://localhost:${PORT}`);
});

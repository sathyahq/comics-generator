'use strict';

const { spawn } = require('child_process');

/**
 * Use Claude CLI to generate humorous panel-by-panel dialogue for a comic strip.
 * Returns an object: { panels: [...] }
 */
async function generateDialogue(topic) {
  const prompt = `Create a funny, witty 4-panel comic strip script about: "${topic}"

Return ONLY a valid JSON object. No markdown, no explanation, just JSON.

The JSON must have this exact structure:
{
  "panels": [
    {
      "panelNumber": 1,
      "characters": [
        {
          "id": "A",
          "expression": "happy",
          "dialogue": "Short punchy line here"
        }
      ]
    }
  ]
}

RULES:
- Exactly 4 panels
- Each panel has 1 or 2 characters
- Character ids are "A" or "B" (both can appear in same panel for dialogue exchange)
- Expressions must be one of: happy, sad, surprised, thinking, excited, angry
- Dialogue: MAX 45 characters per line — short, punchy, funny
- Panel 1: setup the situation
- Panel 2: escalate/develop
- Panel 3: twist or complication
- Panel 4: punchline payoff
- Tone: humorous, relatable, witty
- Return ONLY the raw JSON object`;

  let stdout;
  try {
    stdout = await new Promise((resolve, reject) => {
      const proc = spawn(
        'claude',
        ['--print', '--output-format', 'json', '--model', 'claude-opus-4-6', '--tools', ''],
        { stdio: ['pipe', 'pipe', 'pipe'], cwd: '/tmp' }
      );
      proc.stdin.write(prompt);
      proc.stdin.end();
      let out = '';
      let err = '';
      proc.stdout.on('data', d => { out += d; });
      proc.stderr.on('data', d => { err += d; });
      proc.on('close', code => {
        if (code !== 0) reject(new Error(`Claude CLI exited ${code}: ${err}`));
        else resolve(out);
      });
      proc.on('error', reject);
    });
  } catch (err) {
    throw new Error(`Claude CLI failed: ${err.message}`);
  }

  // The CLI returns a JSON envelope; extract the result field
  let raw;
  try {
    const envelope = JSON.parse(stdout.trim());
    raw = envelope.result || envelope.content || stdout;
  } catch (_) {
    // If not JSON envelope, use stdout directly
    raw = stdout;
  }

  // Strip markdown code fences if Claude wraps in them
  const jsonText = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Failed to parse Claude response as JSON: ${err.message}\nRaw: ${raw.slice(0, 200)}`);
  }

  if (!data.panels || !Array.isArray(data.panels)) {
    throw new Error('Invalid response structure: missing panels array');
  }

  // Clamp to 4 panels and validate each
  data.panels = data.panels.slice(0, 4).map((panel, i) => ({
    panelNumber: i + 1,
    characters: (panel.characters || []).slice(0, 2).map(char => ({
      id: char.id === 'B' ? 'B' : 'A',
      expression: validateExpression(char.expression),
      dialogue: truncate(char.dialogue || '', 50),
    })),
  }));

  // Ensure we have at least 3 panels
  while (data.panels.length < 3) {
    data.panels.push({
      panelNumber: data.panels.length + 1,
      characters: [{ id: 'A', expression: 'thinking', dialogue: '...' }],
    });
  }

  return data;
}

const VALID_EXPRESSIONS = new Set(['happy', 'sad', 'surprised', 'thinking', 'excited', 'angry']);

function validateExpression(expr) {
  return VALID_EXPRESSIONS.has(expr) ? expr : 'happy';
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

module.exports = { generateDialogue };

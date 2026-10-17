// Formulas: insert one in a note, click it to edit, and delete it from the formula panel
const {open} = require('./harness'); const path = require('path');
const APP = process.env.APP || require('path').resolve(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok  ' + m); };
(async () => {
  const {browser, page, errors} = await open(APP);
  await page.waitForTimeout(500);
  await page.setInputFiles('#file', path.join(__dirname, 'lecture.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pagecard').length >= 6, null, {timeout: 60000}); await page.waitForTimeout(600);
  const strip = page.locator('.pagecard').nth(1).locator('.strip').last(); await strip.scrollIntoViewIfNeeded();
  const b = await strip.boundingBox(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.keyboard.type('Weights: ');
  await page.click('#tab-insert'); await page.click('#fBtn'); await page.waitForTimeout(300);
  await page.fill('#fInput', 'w_i = (P_i)/(sum P)'); await page.waitForTimeout(400);
  ok(await page.isHidden('#fDelete'), 'a new formula has no Delete button');
  await page.click('#fInsert'); await page.waitForTimeout(400);
  await page.keyboard.type('after');
  ok(await page.locator('.mine .formula').count() === 1, 'the formula is in the note');
  await page.mouse.click(5, 700); await page.waitForTimeout(600);
  // two notes' worth: a note that only holds a formula goes when its formula is deleted
  await page.click('.mine .formula'); await page.waitForTimeout(400);
  ok(!(await page.isHidden('#formulaPanel')) && await page.isVisible('#fDelete') && (await page.textContent('#fInsert')).trim() === 'Update', 'clicking a formula opens it with Update and Delete');
  await page.click('#fDelete'); await page.waitForTimeout(500);
  ok(await page.locator('.mine .formula').count() === 0 && await page.isHidden('#formulaPanel'), 'Delete removes the formula and closes the panel');
  const left = await page.evaluate(() => document.querySelector('.pagecard:nth-child(1 of .pagecard) ~ .pagecard .mine, .pagecard .mine')?.textContent);
  ok(/Weights:\s?after/.test(left.replace(/\u00a0/g, ' ')), 'the rest of the note stays (' + JSON.stringify(left) + ')');
  ok(/Formula deleted/.test(await page.textContent('#toast')), 'and says Back brings it back');
  await page.mouse.click(5, 700); await page.waitForTimeout(700);
  await page.click('#undoBtn'); await page.waitForTimeout(700);
  ok(await page.locator('.mine .formula').count() === 1, 'Back brings it back');
  // a note holding only a formula is removed with it
  await page.mouse.click(5, 700); await page.waitForTimeout(300);
  const strip2 = page.locator('.pagecard').nth(3).locator('.strip').last(); await strip2.scrollIntoViewIfNeeded();
  const b2 = await strip2.boundingBox(); await page.mouse.move(b2.x + b2.width * 0.6, b2.y + b2.height / 2, {steps: 3}); await page.waitForTimeout(200);
  await page.click('.gappill'); await page.click('#tab-insert'); await page.click('#fBtn'); await page.waitForTimeout(300);
  await page.fill('#fInput', 'E = mc^2'); await page.click('#fInsert'); await page.waitForTimeout(400);
  await page.mouse.click(5, 700); await page.waitForTimeout(600);
  const n0 = await page.locator('.notebox').count();
  await page.locator('.pagecard >> nth=3').locator('.formula').click(); await page.waitForTimeout(300); await page.click('#fDelete'); await page.waitForTimeout(600);
  ok(await page.locator('.notebox').count() === n0 - 1, 'a note that only held the formula is removed too');
  await browser.close();
  const errs = errors.filter(e => !/ERR_FAILED|net::/.test(e));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})().catch(e => { console.error(e.message); process.exit(1); });

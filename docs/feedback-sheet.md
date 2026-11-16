# Send lesson feedback to a Google Sheet

The "Feedback on this lesson" button posts one JSON row per submission. To collect them in a spreadsheet (about 5 minutes, free):

1. Create a Google Sheet. Put these headers in row 1:
   `when, lesson, title, course, rating, text, passed, lessons_done, page`
2. In the sheet: **Extensions → Apps Script**. Replace the code with:

```js
function doPost(e) {
  const r = JSON.parse(e.postData.contents);
  const clean = (v) => String(v ?? '').slice(0, 2000).replace(/^[=+\-@]/, "'$&"); // no formulas from strangers
  SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].appendRow(
    ['when', 'lesson', 'title', 'course', 'rating', 'text', 'passed', 'lessons_done', 'page'].map((k) => clean(r[k])));
  return ContentService.createTextOutput('ok');
}
```

3. **Deploy → New deployment → Web app**. Execute as: *Me*. Who has access: *Anyone*. Copy the web-app URL.
4. Paste the URL into `FEEDBACK_URL` in [`js/config.js`](../js/config.js) and push.

Notes

- Submissions are anonymous: no name, email or IP is stored by the script. Say so on the site if you change that.
- The URL is public, so anyone could post junk rows. The script caps length and neutralises formulas; if spam shows up, add a shared secret field or switch to a Google Form.
- With `FEEDBACK_URL` empty, the button opens a pre-filled GitHub issue instead.

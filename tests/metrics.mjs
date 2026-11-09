import assert from 'node:assert/strict'
import {documentMetrics} from '../src/metrics.ts'
assert.equal(documentMetrics('# 圖片\n\n![圖片](typora-reference/client-newsprint.png)').words,3)
assert.equal(documentMetrics('[hello world](https://example.com/long/path)').words,2)
assert.equal(documentMetrics('---\ntitle: hidden metadata\n---\n\n文字').words,2)
assert.equal(documentMetrics('| A | B |\n| --- | --- |\n| 一 | 二 |').words,4)
assert.equal(documentMetrics('```js\nhello world\n```').words,2)
console.log('Document metrics: passed')

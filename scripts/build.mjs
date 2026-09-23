import {readFile,writeFile,mkdir} from 'node:fs/promises';
const css=await readFile('style.css','utf8');
const photo=(await readFile('assets/team-2008.jpg')).toString('base64');
const js=(await Promise.all(['data.js','engine.js','physics.js','game.js','app.js'].map(f=>readFile(f,'utf8')))).join('\n').replace(/^import .*;\n/gm,'').replace(/^export /gm,'').replaceAll('assets/team-2008.jpg',`data:image/jpeg;base64,${photo}`);
const html=(await readFile('index.html','utf8')).replace('<link rel="stylesheet" href="style.css">',()=>`<style>${css}</style>`).replace('<script type="module" src="app.js"></script>',()=>`<script type="module">${js.replaceAll('</script','<\\/script')}</script>`);
await mkdir('dist',{recursive:true});await writeFile('dist/index.html',html);
// Vercel config: one canonical address, www.mighty4s.com -> mighty4s.com.
await writeFile('dist/vercel.json',JSON.stringify({redirects:[{source:'/(.*)',has:[{type:'host',value:'www.mighty4s.com'}],destination:'https://mighty4s.com/$1',permanent:true}]},null,2));console.log(`Built standalone game: dist/index.html (${Math.round(Buffer.byteLength(html)/1024)} KB)`);

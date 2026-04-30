const fs = require('fs');
const html = fs.readFileSync('jujutsu.html', 'utf8');
const links = html.match(/href=["'](https:\/\/animejara\.com[^"']+)["']/gi);
if (links) {
    const urls = [...new Set(links.map(l => l.replace(/href=["']/i, '').replace(/["']/g, '')))];
    const eps = urls.filter(u => u.includes('episode') || u.includes('episodio'));
    fs.writeFileSync('jjk_links.txt', urls.join('\n') + '\n\nEPS:\n' + eps.join('\n'));
}

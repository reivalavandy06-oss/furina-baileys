const [major, minor] = process.versions.node.split('.').map(part => parseInt(part, 10));
const supported = major === 20 ? minor >= 19 : major >= 22 && (major > 22 || minor >= 12);

if (!supported) {
  console.error(
    `\n❌ This package requires Node.js 20.19+ or 22.12+ for built-in ESM loading.\n` +
    `   You are using Node.js ${process.versions.node}.\n` +
    `   Please upgrade Node.js to proceed.\n`
  );
  process.exit(1);
}

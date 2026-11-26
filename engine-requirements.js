const [major] = process.versions.node.split('.').map(part => parseInt(part, 10));
const supported = major >= 22;

if (!supported) {
  console.error(
    `\n❌ This package requires Node.js >= 22.0.0.\n` +
    `   You are using Node.js ${process.versions.node}.\n` +
    `   Node.js 20 is End-of-Life. Please upgrade Node.js to proceed.\n`
  );
  process.exit(1);
}

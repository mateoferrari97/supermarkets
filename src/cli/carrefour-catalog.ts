import { downloadCatalog } from "../compose.ts";

const { meta, outputDir } = await downloadCatalog(process.argv[2], (done) => {
  process.stdout.write(`\r${String(done)} categories`);
});
process.stdout.write(`\n${JSON.stringify(meta, null, 2)}\nWritten to ${outputDir}\n`);

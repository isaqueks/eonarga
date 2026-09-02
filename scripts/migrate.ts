import { runMigrations } from "../src/lib/db/migrate";

runMigrations()
  .then(() => {
    console.log("migrations ok");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

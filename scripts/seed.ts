import { seedAll } from "../src/lib/db/seed";

seedAll()
  .then((r) => {
    console.log(`categorias novas: ${r.categoriesCreated}`);
    console.log(
      r.admin.created ? `admin criado: ${r.admin.email}` : `admin não criado: ${r.admin.reason}`,
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

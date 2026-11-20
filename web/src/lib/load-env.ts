import dotenv from "dotenv";
import path from "path";

const cwd = process.cwd();
dotenv.config({ path: path.join(cwd, ".env.local") });
dotenv.config({ path: path.join(cwd, ".env") });
// Docker / VPS: secretos en /opt/recetas/.env (un nivel arriba de web/)
dotenv.config({ path: path.join(cwd, "..", ".env") });

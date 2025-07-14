import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

const {
    DISCORD_TOKEN,
    APPLICATION_ID,
    GUILD_ID,
    MYSQL_HOST = "127.0.0.1",
    MYSQL_PORT = "3306",
    MYSQL_USER = "mangos",
    MYSQL_PASSWORD = "mangos",
    CHAR_DB = "characters",
    WORLD_HOST = MYSQL_HOST,
    WORLD_PORT = "8085",
    STATUS_CHANNEL_ID,
    UPDATE_INTERVAL = "60",
  } = process.env;

async function main() {
    console.log(CHAR_DB)
    const pool = mysql.createPool({
        host: MYSQL_HOST,
        port: Number(MYSQL_PORT),
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        database: CHAR_DB,
        connectionLimit: 5,
      });
    
      try {
        const [rows] = await pool.query('SELECT 1');
        console.log('DB connected OK:', rows);
      } catch (err) {
        console.error('DB connection failed:', err);
      }
}

main()

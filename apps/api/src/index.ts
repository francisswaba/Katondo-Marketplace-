import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { Pool } from 'pg';
import type { CatalogueResponse } from '@katondo/contracts';

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json());

app.get('/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch {
    response.status(503).json({ status: 'unavailable' });
  }
});

app.get('/api/catalogue', async (_request, response) => {
  try {
    const [categoriesResult, listingsResult] = await Promise.all([
      pool.query('SELECT id, name, slug FROM categories ORDER BY name'),
      pool.query(`
        SELECT l.id, l.title, l.description, l.price_minor, l.currency,
               l.condition, l.category_id, c.name AS category_name,
               l.seller_name, l.quantity
        FROM listings l
        JOIN categories c ON c.id = l.category_id
        ORDER BY l.created_at DESC
      `),
    ]);

    const result: CatalogueResponse = {
      categories: categoriesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
      })),
      listings: listingsResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        priceMinor: Number(row.price_minor),
        currency: row.currency.trim(),
        condition: row.condition,
        categoryId: row.category_id,
        categoryName: row.category_name,
        sellerName: row.seller_name,
        quantity: row.quantity,
      })),
    };

    response.json(result);
  } catch (error) {
    console.error('Catalogue request failed', error);
    response.status(503).json({ error: 'Catalogue is temporarily unavailable.' });
  }
});

app.listen(port, () => {
  console.log(`Katondo API listening on http://localhost:${port}`);
});

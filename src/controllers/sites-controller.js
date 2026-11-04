import { query } from "../repositories/database.js";

export async function sitesController(_request, response, next) {
  try {
    const result = await query("SELECT id, name FROM sites ORDER BY name, id");
    response.json({
      data: result.rows.map((site) => ({
        id: Number(site.id),
        name: site.name,
      })),
    });
  } catch (error) {
    next(error);
  }
}

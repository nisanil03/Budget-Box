import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { Pool } from "pg";

dotenv.config();

type Budget = {
  income: number;
  monthlyBills: number;
  food: number;
  transport: number;
  subscriptions: number;
  miscellaneous: number;
};

type BudgetRecord = {
  email: string;
  budget: Budget;
  updatedAt: string;
};

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "hire-me@anshumat.org";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "HireMe@2025!";

const PORT = process.env.PORT ?? 4000;
const DATABASE_URL = process.env.DATABASE_URL;

class BudgetStore {
  private memory = new Map<string, BudgetRecord>();
  private pool?: Pool;

  constructor() {
    if (DATABASE_URL) {
      this.pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
      void this.ensureTable();
    }
  }

  private async ensureTable() {
    if (!this.pool) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        email TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `);
  }

  async save(record: BudgetRecord) {
    if (this.pool) {
      await this.pool.query(
        `
          INSERT INTO budgets (email, payload, updated_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (email)
          DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
        `,
        [record.email, record.budget, record.updatedAt]
      );
      return;
    }
    this.memory.set(record.email, record);
  }

  async latest(email: string): Promise<BudgetRecord | null> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT email, payload as budget, updated_at as "updatedAt" FROM budgets WHERE email=$1`,
        [email]
      );
      return res.rows[0] ?? null;
    }
    return this.memory.get(email) ?? null;
  }
}

const budgetStore = new BudgetStore();
const tokenMap = new Map<string, string>();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "budgetbox-backend" }));

app.post("/auth/login", (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
    const token = Buffer.from(`${email}:${Date.now()}`).toString("base64");
    tokenMap.set(token, email);
    return res.json({ token, email });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

app.post("/budget/sync", async (req: Request, res: Response) => {
  const { budget, email } = req.body as { budget?: Budget; email?: string };
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.replace("Bearer ", "");
  const tokenEmail = tokenMap.get(token);

  const resolvedEmail = email ?? tokenEmail;
  if (!resolvedEmail) {
    return res.status(400).json({ error: "Email is required" });
  }
  if (tokenMap.size && tokenEmail && tokenEmail !== resolvedEmail) {
    return res.status(403).json({ error: "Token does not match email" });
  }
  if (!budget) {
    return res.status(400).json({ error: "Budget payload missing" });
  }

  const updatedAt = new Date().toISOString();
  await budgetStore.save({ email: resolvedEmail, budget, updatedAt });
  return res.json({ success: true, timestamp: updatedAt });
});

app.get("/budget/latest", async (req: Request, res: Response) => {
  const email = (req.query.email as string) ?? DEMO_EMAIL;
  const record = await budgetStore.latest(email);
  if (!record) {
    return res.json({ budget: null, updatedAt: null });
  }
  return res.json({ budget: record.budget, updatedAt: record.updatedAt });
});

app.listen(PORT, () => {
  console.log(`BudgetBox backend listening on http://localhost:${PORT}`);
});


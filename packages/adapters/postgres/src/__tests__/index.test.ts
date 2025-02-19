import { PostgresDatabaseAdapter } from "../index";
import pg from "pg";
describe("PostgresDatabaseAdapter", () => {
  let adapter: PostgresDatabaseAdapter;
  beforeEach(async () => {
    adapter = new PostgresDatabaseAdapter({
      connectionString: "postgresql://root:123456@localhost:5432/binkai_db",
    });
    // await adapter.init();
  });

  afterEach(async () => {
    await adapter.cleanup();
  });

  describe("hello", () => {
    it("should be true", () => {
      expect(true).toBe(true);
    });
  });
});

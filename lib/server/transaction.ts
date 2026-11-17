/** Database transactions shared by the server-side operations. Server only. */
import { adminServices } from "../appwrite/server";

/**
 * Run `work` inside a database transaction: either every write in it is
 * saved, or none is. This keeps a record and its history from disagreeing.
 */
export async function inTransaction(work: (transactionId: string) => Promise<void>) {
  const { tablesDB } = adminServices();
  const tx = await tablesDB.createTransaction();
  try {
    await work(tx.$id);
    await tablesDB.updateTransaction({ transactionId: tx.$id, commit: true });
  } catch (err) {
    await tablesDB.updateTransaction({ transactionId: tx.$id, rollback: true }).catch(() => {});
    throw err;
  }
}

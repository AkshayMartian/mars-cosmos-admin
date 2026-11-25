import { MongoClient, type Db } from 'mongodb'

export interface Database {
  client: MongoClient
  db: Db
  close: () => Promise<void>
}

/** Connects once at start-up. A wrong connection string fails here, with the driver's message. */
export async function connectDb(uri: string, dbName: string): Promise<Database> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
  await client.connect()
  return { client, db: client.db(dbName), close: () => client.close() }
}

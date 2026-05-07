import type { User } from "@/db/schema"

/** User type without passwordHash/encryptedDek — safe to send to the client */
export type SafeUser = Omit<User, "passwordHash" | "encryptedDek">

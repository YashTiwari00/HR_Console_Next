import { account, databases } from "@/lib/appwrite";
import { ID } from "appwrite";
import { Query } from "appwrite";

const DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID;
const USERS_TABLE = "users";

export async function signup(name, email, password) {
  try {
    // STEP 1: Create auth account
    const user = await account.create(ID.unique(), email, password, name);

    // STEP 2: Create HR profile row
    await databases.createDocument(DATABASE_ID, USERS_TABLE, user.$id, {
      // $id: user.$id,
      name: name,
      email: email,
      role: "employee",
      department: "engineering",
    });

    return user;
  } catch (error) {
    console.error(error);
  }
}

export async function login(email, password) {
  try {
    const session = await account.createEmailPasswordSession(email, password);

    return session;
  } catch (error) {
    console.error(error);
  }
}

export async function logout() {
  try {
    await account.deleteSession("current");
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function getCurrentUser() {
  try {
    const user = await account.get();

    return user;
  } catch {
    return null;
  }
}

export async function getUserProfile(userId) {
  const result = await databases.listDocuments(DATABASE_ID, USERS_TABLE, [
    Query.equal("$id", userId),
  ]);

  return result.documents[0];
}

export async function getUserRole() {
  const user = await getCurrentUser();

  if (!user) return null;

  const profile = await getUserProfile(user.$id);

  return profile.role;
}

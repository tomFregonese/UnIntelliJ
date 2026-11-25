export interface User {
  id: string;
  name: string;
}

export class UserService {
  private readonly users = new Map<string, User>();

  findUser(id: string): User | undefined {
    return this.users.get(id);
  }

  saveUser(user: User): void {
    this.users.set(user.id, user);
  }
}

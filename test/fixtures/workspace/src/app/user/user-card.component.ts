import { UserService } from './user.service';

export class UserCardComponent {
  constructor(private readonly service: UserService) {}

  load(id: string): string {
    return this.service.findUser(id)?.name ?? 'unknown';
  }
}

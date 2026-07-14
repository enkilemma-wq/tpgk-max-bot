import { StartedUserInfo, UserRepository } from '../../domain/ports/UserRepository';

export class RegisterUser {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(user: StartedUserInfo): Promise<void> {
    await this.userRepository.registerStart(user);
  }
}

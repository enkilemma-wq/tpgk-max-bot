import { UserRepository } from '../../domain/ports/UserRepository';

export type StaffCommandResult = { kind: 'unauthorized' } | { kind: 'staff_panel' };

export class HandleStaffCommand {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(userId: number): Promise<StaffCommandResult> {
    const role = await this.userRepository.getRole(userId);
    if (role === 'user') {
      return { kind: 'unauthorized' };
    }
    return { kind: 'staff_panel' };
  }
}

import { seedJob } from './jobs';
import { mockJobs } from '../../features/jobs/mockJobs';

export async function seedInitialJobs() {
  for (const job of mockJobs) {
    const { id: _id, ...rest } = job;
    await seedJob(rest);
  }
}
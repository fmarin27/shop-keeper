import { seedInitialJobs } from './services/firebase/seedJobs';
import { seedInitialMaterialsAndMessages } from './services/firebase/seedMaterialsMessages';

async function run() {
  await seedInitialJobs();
  await seedInitialMaterialsAndMessages();
  console.log('Seed complete');
}

run().catch((error) => {
  console.error('Seed failed', error);
});
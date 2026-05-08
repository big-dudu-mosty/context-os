import { closeDb, query } from './db';
import { AgentRepository } from './repositories/agent.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserRepository } from './repositories/user.repository';

async function main(): Promise<void> {
  console.log('Testing CRUD operations...');

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const sessionRepo = new SessionRepository();

  let userId: string | null = null;
  let agentId: string | null = null;
  let sessionId: string | null = null;

  try {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;
    const email = `test-${uniqueSuffix}@example.com`;

    console.log('1. Creating user...');
    const user = await userRepo.create({
      name: 'Test User',
      email,
      role: 'member',
    });
    userId = user.id;
    console.log('User created:', user.id);

    const foundUser = await userRepo.findByEmail(email);
    if (!foundUser) {
      throw new Error('Created user was not found by email');
    }

    console.log('2. Creating agent...');
    const agent = await agentRepo.create({
      owner_id: user.id,
      name: 'Test Agent',
      type: 'claude-code-cli',
    });
    agentId = agent.id;
    console.log('Agent created:', agent.id);

    console.log('3. Creating session...');
    const session = await sessionRepo.create({
      agent_id: agent.id,
      owner_id: user.id,
    });
    sessionId = session.id;
    console.log('Session created:', session.id);

    console.log('4. Updating session...');
    const updatedSession = await sessionRepo.update(session.id, {
      ended_at: new Date(),
      transcript_path: '/tmp/test.md',
      transcript_hash: '0'.repeat(64),
      dream_status: 'pending',
      dream_attempts: 1,
    });

    if (!updatedSession) {
      throw new Error('Session update returned no row');
    }

    console.log('Session updated:', updatedSession.dream_status);

    console.log('5. Querying sessions...');
    const sessions = await sessionRepo.findByAgent(agent.id);
    if (sessions.length !== 1) {
      throw new Error(`Expected 1 session, found ${sessions.length}`);
    }

    console.log('Found sessions:', sessions.length);
    console.log('All CRUD checks passed.');
  } catch (error) {
    console.error('CRUD test failed:', error);
    process.exitCode = 1;
  } finally {
    if (sessionId) {
      await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    }

    if (agentId) {
      await query('DELETE FROM agents WHERE id = $1', [agentId]);
    }

    if (userId) {
      await query('DELETE FROM users WHERE id = $1', [userId]);
    }

    await closeDb();
  }
}

void main();

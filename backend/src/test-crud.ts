import { closeDb, query } from './db';
import { ContextPackageRepository } from './repositories/context-package.repository';
import { DomainEventRepository } from './repositories/domain-event.repository';
import { AgentRepository } from './repositories/agent.repository';
import { ProjectRepository } from './repositories/project.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserRepository } from './repositories/user.repository';

async function main(): Promise<void> {
  console.log('Testing CRUD operations...');

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const projectRepo = new ProjectRepository();
  const sessionRepo = new SessionRepository();
  const contextPackageRepo = new ContextPackageRepository();
  const domainEventRepo = new DomainEventRepository();

  let userId: string | null = null;
  let agentId: string | null = null;
  let projectId: string | null = null;
  let sessionId: string | null = null;
  let contextPackageId: string | null = null;

  try {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;
    const email = `test-${uniqueSuffix}@example.com`;
    const projectSlug = `test-project-${uniqueSuffix}`;

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

    console.log('3. Creating project...');
    const project = await projectRepo.create({
      slug: projectSlug,
      name: 'Test Project',
      description: 'Temporary CRUD test project',
      created_by: user.id,
    });
    projectId = project.id;

    if (typeof project.lock_id !== 'number') {
      throw new Error('Expected project.lock_id to be a number');
    }

    const projectMember = await projectRepo.addMember({
      project_id: project.id,
      user_id: user.id,
      role: 'owner',
    });

    const isMember = await projectRepo.isMember(project.id, user.id);
    if (!isMember) {
      throw new Error('Project membership check failed');
    }

    const members = await projectRepo.getMembers(project.id);
    if (members.length !== 1 || members[0]?.id !== projectMember.id) {
      throw new Error('Project members query failed');
    }

    const foundProject = await projectRepo.findBySlug(projectSlug);
    if (!foundProject) {
      throw new Error('Created project was not found by slug');
    }

    console.log('Project created:', project.id);

    console.log('4. Creating session...');
    const session = await sessionRepo.create({
      agent_id: agent.id,
      owner_id: user.id,
      project_id: project.id,
    });
    sessionId = session.id;
    console.log('Session created:', session.id);

    console.log('5. Updating session...');
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

    console.log('6. Querying sessions...');
    const sessions = await sessionRepo.findByAgent(agent.id);
    if (sessions.length !== 1) {
      throw new Error(`Expected 1 session, found ${sessions.length}`);
    }

    console.log('Found sessions:', sessions.length);

    console.log('7. Creating context package...');
    const contextPackage = await contextPackageRepo.create({
      source_type: 'session',
      owner_id: user.id,
      agent_id: agent.id,
      title: 'Test Context Package',
      summary: 'Temporary CRUD test package',
      raw_yaml: 'schema_version: test\nsummary: Temporary CRUD test package\n',
      raw_yaml_hash: '1'.repeat(64),
      project_ids: [project.id],
    });
    contextPackageId = contextPackage.id;

    await contextPackageRepo.linkSession(contextPackage.id, session.id);

    const packagesByProject = await contextPackageRepo.findByProject(project.id);
    if (packagesByProject.length !== 1) {
      throw new Error(
        `Expected 1 package by project, found ${packagesByProject.length}`
      );
    }

    const sessionPackages = await contextPackageRepo.getSessionPackages(
      session.id
    );
    if (sessionPackages.length !== 1) {
      throw new Error(
        `Expected 1 package linked to session, found ${sessionPackages.length}`
      );
    }

    console.log('Context package created:', contextPackage.id);

    console.log('8. Creating domain event...');
    const latestSeqBefore = await domainEventRepo.getLatestSeq(project.id);
    const domainEvent = await domainEventRepo.create({
      project_id: project.id,
      project_event_seq: latestSeqBefore + 1,
      event_type: 'context_submitted',
      aggregate_type: 'context_package',
      aggregate_id: contextPackage.id,
      owner_id: user.id,
      agent_id: agent.id,
      session_id: session.id,
      payload: {
        package_id: contextPackage.id,
        title: contextPackage.title,
      },
      idempotency_key: `crud-test-${uniqueSuffix}`,
    });

    if (
      typeof domainEvent.id !== 'number' ||
      typeof domainEvent.project_event_seq !== 'number'
    ) {
      throw new Error('Expected domain event bigint fields to be numbers');
    }

    const events = await domainEventRepo.findByProject(project.id);
    if (events.length !== 1 || events[0]?.id !== domainEvent.id) {
      throw new Error('Domain event query failed');
    }

    const latestSeqAfter = await domainEventRepo.getLatestSeq(project.id);
    if (latestSeqAfter !== domainEvent.project_event_seq) {
      throw new Error('Latest project event sequence did not update');
    }

    console.log('Domain event created:', domainEvent.id);
    console.log('All CRUD checks passed.');
  } catch (error) {
    console.error('CRUD test failed:', error);
    process.exitCode = 1;
  } finally {
    if (projectId) {
      await query('DELETE FROM domain_events WHERE project_id = $1', [
        projectId,
      ]);
    }

    if (sessionId) {
      await query('DELETE FROM session_packages WHERE session_id = $1', [
        sessionId,
      ]);
    }

    if (contextPackageId) {
      await query('DELETE FROM context_packages WHERE id = $1', [
        contextPackageId,
      ]);
    }

    if (sessionId) {
      await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    }

    if (projectId) {
      await query('DELETE FROM project_members WHERE project_id = $1', [
        projectId,
      ]);
      await query('DELETE FROM projects WHERE id = $1', [projectId]);
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

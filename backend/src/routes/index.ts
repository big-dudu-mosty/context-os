import { Router } from "express";
import { AgentController } from "../controllers/agent.controller";
import { BriefingController } from "../controllers/briefing.controller";
import { DreamController } from "../controllers/dream.controller";
import { HandoffController } from "../controllers/handoff.controller";
import { ProjectController } from "../controllers/project.controller";
import { QueryController } from "../controllers/query.controller";
import { SessionController } from "../controllers/session.controller";
import { UserController } from "../controllers/user.controller";

const router = Router();

const userController = new UserController();
const agentController = new AgentController();
const sessionController = new SessionController();
const projectController = new ProjectController();
const dreamController = new DreamController();
const briefingController = new BriefingController();
const handoffController = new HandoffController();
const queryController = new QueryController();

router.post("/users", (req, res) => {
  void userController.create(req, res);
});
router.get("/users/:id", (req, res) => {
  void userController.getById(req, res);
});

router.post("/agents", (req, res) => {
  void agentController.create(req, res);
});
router.get("/agents/:id", (req, res) => {
  void agentController.getById(req, res);
});

router.post("/sessions", (req, res) => {
  void sessionController.create(req, res);
});
router.get("/sessions/:id", (req, res) => {
  void sessionController.getById(req, res);
});
router.put("/sessions/:id/end", (req, res) => {
  void sessionController.end(req, res);
});

router.post("/projects", (req, res) => {
  void projectController.create(req, res);
});
router.get("/projects/:id", (req, res) => {
  void projectController.getById(req, res);
});

router.post("/dream/:agentId", (req, res) => {
  void dreamController.trigger(req, res);
});

router.post("/briefing", (req, res) => {
  void briefingController.generate(req, res);
});
router.get("/briefing/:userId", (req, res) => {
  void briefingController.getHistory(req, res);
});

router.post("/handoff", (req, res) => {
  void handoffController.create(req, res);
});
router.get("/handoff/pending/:userId", (req, res) => {
  void handoffController.getPending(req, res);
});
router.put("/handoff/:id/accept", (req, res) => {
  void handoffController.accept(req, res);
});
router.put("/handoff/:id/dismiss", (req, res) => {
  void handoffController.dismiss(req, res);
});

router.get("/projects/:projectId/decisions", (req, res) => {
  void queryController.getDecisions(req, res);
});
router.get("/projects/:projectId/tasks", (req, res) => {
  void queryController.getTasks(req, res);
});
router.get("/projects/:projectId/risks", (req, res) => {
  void queryController.getRisks(req, res);
});
router.get("/projects/:projectId/questions", (req, res) => {
  void queryController.getQuestions(req, res);
});

export default router;

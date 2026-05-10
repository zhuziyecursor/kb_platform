# NotebookLM PPT 生成提示词（精简版）

请复制下面代码块中的内容到 NotebookLM。此版本用于替代桌面上较长的 `NotebookLM_PPT提示词.md`，保留生成约束和重点内容，避免超过 NotebookLM 输入限制。

---

```text
请基于我提供的资料，生成一份面向企业高管、技术负责人和项目评审专家的 PPT 汇报文稿。

主题：企业 AI 知识库平台（KB-Platform）建设方案
副标题：从“能回答”到“可信问答”的企业级知识平台建设路径

一、汇报目标

1. 说明为什么不能只依赖通用大模型、小智助手或 Dify 知识库能力。
2. 说明当前 KB-Platform 已经完成哪些能力，以及还存在哪些不足。
3. 说明三阶段建设路线：第一阶段 MVP 可用闭环，第二阶段多路召回增强，第三阶段权限、评测和生产治理。
4. 让领导和专家理解本方案不是概念设计，而是能落地、能验收、能治理的工程方案。

二、听众与风格

听众：CTO、技术 VP、业务部门领导、架构评审专家、项目管理人员。
风格：专业、简洁、可决策，避免堆砌代码和底层实现细节。
页数：建议 18-22 页。
输出形式：请按“页码 + 页面标题 + 核心观点 + 页面要点 + 视觉建议 + 讲述备注”输出。

三、推荐 PPT 结构

第 1 页：封面
标题：企业 AI 知识库平台建设方案
核心表达：面向审计/企业知识场景，建设可控、可信、可持续优化的 AI 知识平台。

第 2 页：为什么要做企业 AI 知识库
说明通用大模型的三类局限：知识不实时、不了解企业内部知识、回答缺少可追溯依据。
强调 RAG 的价值：先检索企业知识，再基于可信材料生成答案。

第 3 页：现有方案的不足
对比小智助手、Dify 或简单知识库方案的瓶颈：
单路向量召回、切片粗糙、无多路召回、权限不足、缺少评测闭环、可观测弱、生产治理不足。

第 4 页：当前项目已经完成的能力
概括第一阶段已具备能力：
文档上传、MinIO 存储、Kafka 异步入库、Tika 解析、文本清洗、语义切片、Parent-Child、embedding、Milvus 入库、Dense 检索、Rerank、DB ACL 二次校验、Prompt Token 预算控制、SSE 流式输出、引用、会话、Pipeline Trace、空间管理和空间 ACL。

第 5 页：当前仍存在的关键缺口
重点说明：
权限仍有开发态常量、检索仍以 Dense 为主、OCR/表格/图表解析不足、文档软下线和向量删除未闭环、评测体系缺失、反馈闭环和成本治理不足。

第 6 页：总体目标架构
展示分层架构：
前端门户/业务系统/智能体 → 统一网关 → ingest-service、doc-processor、vector-service、rag-service、llm-gateway、auth-adapter、user-service、eval-service → PostgreSQL、Redis、Kafka、MinIO、Milvus、OpenSearch/Elasticsearch、Prometheus。
强调微服务、异步解耦、契约优先、可观测和可扩展。

第 7 页：文件上传到向量入库的当前流程
展示实际完成链路：
init-upload → MinIO 上传 → verify → commit 文档元数据/ACL/版本 → file-ingest Kafka → doc-processor 解析/清洗/切片/embedding → embed-task Kafka → vector-service → Milvus upsert → 文档 READY。
强调当前已经是一条可运行的知识入库闭环。

第 8 页：检索问答的当前流程
展示实际 RAG 链路：
用户问题 → 会话上下文 → 查询改写 → embedding → Milvus Dense TopK → ACL 过滤 → Rerank → DB ACL 二次校验 → Parent 回捞 → 拒答判断 → Prompt 预算控制 → LLM 生成 → 引用返回 → Trace 记录。
强调已经支持引用、流式、会话、Trace 和 Prompt 预算控制。

第 9 页：第一阶段安全门槛
说明完整 OBO 权限放在第三阶段，但真实试点前必须避免 DEV tenant/user/perm_group 进入真实数据场景。
要求：
演示数据可用 mock；单租户试点必须白名单、空间 ACL、审计；多租户和高密级数据必须等真实 OBO/JWT 和 tenant 绑定完成。
补充 CurrentUserContext 抽象：业务代码不再直接依赖 DEV 常量。

第 10 页：第二阶段为什么要做多路召回
说明 Dense 检索对条款编号、专有名词、精确数值、高频问题和复杂追问有天花板。
第二阶段目标：提升找得准、答得稳、成本可控。

第 11 页：第二阶段技术方案
展示多路召回架构：
Dense Retriever、BM25 Retriever、FAQ Retriever、Clause Fast Path、LLM Query Rewrite、IntentRouter、RRF 融合、Rerank、Trace 可视化。
说明：
BM25 解决关键词和编号；FAQ 解决高频问题；Clause Fast Path 解决精确条款；RRF 做融合；LLM Rewrite 提升复杂问题理解。

第 12 页：第二阶段验收指标
建议包含：
精确条款 Recall@5 提升 30% 以上；FAQ 平均延迟低于 500ms；RAG 首 Token P95 小于 1.5s；Top3 引用人工准确率大于 85%；拒答准确率大于 90%；每条 badcase 可回放召回、融合、精排过程。

第 13 页：第三阶段建设前提与边界
说明 BladeX OAuth2 接口已经清楚，基础网关能力也已有。
第三阶段不是从零建设 IAM 或通用网关，而是复用 BladeX 和企业基础网关，在知识库侧完成：
auth-adapter 协议适配、OBO Token Exchange、claims 标准化、user-service 用户上下文、KB/OCR/MCP 路由策略、资源服务二次鉴权、RAG 权限过滤和审计闭环。

第 14 页：第三阶段权限体系
展示 OBO 链路：
用户登录 BladeX → 上层应用获得 user_access_token → auth-adapter 执行 Token Exchange → 签发 aud=mcp-kb 的 obo_access_token → Gateway 校验 iss/aud/scope/tenant → rag/ingest/vector 服务二次校验 → Milvus 预过滤 + PostgreSQL ACL 后过滤。
强调前端 Header 不可信，资源服务不信任自定义用户头。

第 15 页：知识权限模型
说明 RBAC + ABAC + ACL + PermGroup：
RBAC 管操作权限；ABAC 管密级、地区、业务域；space_acl/doc_acl 做最终授权；PermGroup 用于 Milvus 高性能预过滤。
说明当前已有基础：tenant_id、space_acl、doc_acl、sec_level、perm_group_id、acl_version、region_code、biz_domain、effective_from/to。

第 16 页：PermGroup 与 Milvus ACL 下推
讲清楚：
PermGroup 用于避免 Milvus expr 过长；用户上下文计算 perm_group_ids；文档入库写 chunk metadata；检索时使用 tenant、sec_level、perm_group、region、biz_domain、effective_to 做预过滤；命中后仍由 PostgreSQL doc_acl/space_acl 做最终校验。
补充验证要求：Milvus 字段类型、scalar index、空值表达、多权限组、TopK 放大、P95 延迟和越权召回率必须压测。

第 17 页：评测体系与反馈闭环
说明为什么必须建设评测体系：
没有评测就无法判断召回策略、切片策略、模型升级是否真的提升。
评测对象包括：解析质量、切片质量、检索质量、Rerank、生成忠实度、引用准确率、拒答准确率、权限越权率、性能、成本和用户反馈。
反馈闭环：点赞、点踩、收藏、报错、修改建议沉淀为 badcase、FAQ 候选和评测集。

第 18 页：生产治理、审计和成本
说明第三阶段补齐：
token exchange 审计、gateway deny 审计、resource deny 审计、denied_ids、LLM 调用审计、Token 成本、限流、告警、DLQ、JWKS 轮换演练、上游认证不可用 fail-closed 演练。
SLO 建议：
30 页文本型文档 5 分钟内 READY；RAG 首 Token P95 < 1.5s；总耗时 P95 < 8s；RAG 成功率 > 99%；越权召回率 = 0；Trace 完整率 > 99%。

第 19 页：三阶段交付计划
第一阶段：MVP 可用闭环，补齐状态、下线、CurrentUserContext、回归测试。
第二阶段：多路召回和问答增强，4-6 周。
第三阶段：权限、评测、治理，6-8 周，拆成：
3A 认证与 OBO；3B Gateway 与资源服务鉴权；3C 用户上下文与权限组；3D RAG 权限过滤与审计；3E 评测、反馈与生产治理。

第 20 页：风险与应对
必须包含：
文档解析质量风险、多路召回调参风险、DEV 常量残留风险、权限链路复杂风险、PermGroup 膨胀风险、Milvus 表达式兼容性风险、LLM 幻觉风险、成本风险、向量一致性风险、可观测不足风险。
每个风险都要给出具体应对措施。

第 21 页：为什么不直接用 Dify
表达要客观：
Dify 适合快速原型和编排，但企业级审计知识库需要更深的权限、可观测、评测、知识生命周期、多路召回和治理能力。
本项目可以借鉴 Dify 的产品形态，但核心知识入库、检索、权限和审计链路需要自研可控。

第 22 页：总结与决策请求
总结三句话：
第一阶段证明“能做”；第二阶段解决“答得准”；第三阶段解决“敢上线、可治理、可持续优化”。
决策请求：
确认三阶段路线；确认第二阶段优先投入多路召回；确认第三阶段复用 BladeX 和基础网关推进 OBO 权限闭环；确认试点数据安全边界。

四、输出要求

1. 不要生成大段技术代码。
2. 每页内容控制在 PPT 可展示范围内，避免一页塞太多字。
3. 关键页尽量用表格、流程图、分层架构图、时间轴表达。
4. 语言要适合向领导汇报，避免过多底层类名和文件路径。
5. 但必须体现本项目已经完成的真实能力，不能写成空泛规划。
6. 对权限、评测、生产治理要写得严谨，体现可落地和可验收。
```

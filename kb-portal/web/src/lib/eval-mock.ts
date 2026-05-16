import type { EvalMetric, EvalReport } from '@/types';

export interface MockConversation {
  id: string;
  spaceId: string;
  question: string;
  answer: string;
  feedback: 'thumbs_up' | 'thumbs_down' | null;
  createdAt: string;
}

export const mockEvalMetrics: EvalMetric[] = [
  { name: 'Recall@5', value: 88, target: 85, trend: 'up', unit: '%' },
  { name: 'Recall@10', value: 95, target: 92, trend: 'up', unit: '%' },
  { name: 'MRR', value: 0.85, target: 0.82, trend: 'up', unit: '' },
  { name: 'NDCG@10', value: 0.90, target: 0.85, trend: 'up', unit: '' },
  { name: 'Faithfulness', value: 97, target: 95, trend: 'up', unit: '%' },
  { name: '引用接地率', value: 96, target: 95, trend: 'stable', unit: '%' },
  { name: '👍 率', value: 84, target: 80, trend: 'up', unit: '%' },
  { name: '👎 率', value: 5.6, target: 10, trend: 'stable', unit: '%' },
];

export const mockEvalReports: EvalReport[] = [
  { id: 1, spaceId: 'DEFAULT', datasetVersion: '1.0', recallAt5: 0.82, recallAt10: 0.91, mrr: 0.78, ndcg: 0.85, faithfulness: 0.94, groundingRate: 0.92, createdAt: '2026-04-01' },
  { id: 2, spaceId: 'DEFAULT', datasetVersion: '1.1', recallAt5: 0.85, recallAt10: 0.93, mrr: 0.82, ndcg: 0.87, faithfulness: 0.96, groundingRate: 0.94, createdAt: '2026-04-15' },
  { id: 3, spaceId: 'DEFAULT', datasetVersion: '1.2', recallAt5: 0.88, recallAt10: 0.95, mrr: 0.85, ndcg: 0.90, faithfulness: 0.97, groundingRate: 0.96, createdAt: '2026-05-01' },
];

export const mockConversations: MockConversation[] = [
  { id: 'c1', spaceId: 'DEFAULT', question: '年假不足5天怎么算？', answer: '根据公司规定，年假不足5天应按实际天数折算...', feedback: 'thumbs_up', createdAt: '2026-05-13T10:30:00Z' },
  { id: 'c2', spaceId: 'DEFAULT', question: '迟到多久算旷工？', answer: '根据考勤制度规定，迟到或早退超过30分钟视为旷工半天...', feedback: null, createdAt: '2026-05-13T11:00:00Z' },
  { id: 'c3', spaceId: 'DEFAULT', question: 'P2级别的岗位津贴是多少？', answer: '根据薪酬福利体系中的薪资结构标准，P2级别的岗位津贴为3,000元/月...', feedback: 'thumbs_up', createdAt: '2026-05-13T14:15:00Z' },
  { id: 'c4', spaceId: 'DEFAULT', question: '报销流程需要什么材料？', answer: '根据财务管理制度，报销需提供发票、报销单和审批记录...', feedback: 'thumbs_up', createdAt: '2026-05-14T09:20:00Z' },
  { id: 'c5', spaceId: 'DEFAULT', question: '合同审查需要注意什么？', answer: '合同审查需要关注条款完整性、合规性和风险提示...', feedback: 'thumbs_up', createdAt: '2026-05-14T10:45:00Z' },
  { id: 'c6', spaceId: 'DEFAULT', question: '如何部署新的 MCP 服务？', answer: '部署 MCP 服务需要先定义工具列表，然后配置传输层...', feedback: 'thumbs_down', createdAt: '2026-05-14T14:00:00Z' },
  { id: 'c7', spaceId: 'DEFAULT', question: 'Kafka 消费者配置有哪些参数？', answer: 'Kafka 消费者的关键参数包括 group.id、auto.offset.reset...', feedback: 'thumbs_up', createdAt: '2026-05-14T15:30:00Z' },
  { id: 'c8', spaceId: 'DEFAULT', question: 'Milvus 向量检索的性能优化建议？', answer: '可以通过调整索引类型、nprobe 参数和分区策略来优化...', feedback: 'thumbs_up', createdAt: '2026-05-14T16:15:00Z' },
];

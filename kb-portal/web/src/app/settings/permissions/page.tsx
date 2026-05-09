'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Space,
  Button,
  App,
  Tree,
  Tag,
  Select,
  Popconfirm,
  Alert,
  Spin,
  message as antdMessage,
} from 'antd';
import {
  SafetyOutlined,
  SaveOutlined,
  SyncOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import AppLayout from '@/components/AppLayout';
import { getAllSpaceAcl, getSpaceTree, updateSpaceAcl } from '@/api/knowledge-space';
import type { SpaceAclEntry, SpaceAclResponse, KnowledgeSpaceTreeNode } from '@/types';

const { Title, Text } = Typography;

// 内置角色配置
const BUILTIN_ROLES = [
  { code: 'SUPER_ADMIN', name: '超级管理员', color: 'red', desc: '拥有所有空间的管理权限' },
  { code: 'DEPT_ADMIN', name: '部门管理员', color: 'orange', desc: '管理本部门空间' },
  { code: 'USER', name: '普通用户', color: 'blue', desc: '访问被授权的空间' },
  { code: 'KB_OPERATOR', name: '知识库运营', color: 'green', desc: '运营和维护知识库' },
  { code: 'KB_AUDITOR', name: '审计员', color: 'purple', desc: '审计和查看日志' },
];

// 权限级别选项
const PERMISSION_OPTIONS = [
  { value: 'READ', label: '只读', color: 'blue' },
  { value: 'WRITE', label: '编辑', color: 'green' },
  { value: 'ADMIN', label: '管理', color: 'orange' },
];

// 权限颜色映射
const permissionColor = (perm: string) => {
  const found = PERMISSION_OPTIONS.find(p => p.value === perm);
  return found?.color || 'default';
};

// 将空间树转换为 Tree 组件数据
function buildTreeData(spaces: KnowledgeSpaceTreeNode[]): DataNode[] {
  return spaces.map(space => ({
    key: space.id,
    title: space.name,
    children: space.children?.length ? buildTreeData(space.children) : undefined,
    isLeaf: !space.children?.length,
  }));
}

export default function PermissionsPage() {
  const { message: antdMsg } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [spaceTree, setSpaceTree] = useState<KnowledgeSpaceTreeNode[]>([]);
  const [spaceAclMap, setSpaceAclMap] = useState<Map<string, SpaceAclEntry[]>>(new Map());

  // 权限绑定状态: { [roleCode]: { [spaceId]: permission } }
  const [bindingMatrix, setBindingMatrix] = useState<Record<string, Record<string, string>>>({});

  // 加载数据
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // 并行加载空间树和 ACL 配置
        const [treeData, aclData] = await Promise.all([
          getSpaceTree(),
          getAllSpaceAcl(),
        ]);

        setSpaceTree(treeData);
        setSpaceTree(treeData);

        // 构建 ACL map
        const aclMap = new Map<string, SpaceAclEntry[]>();
        aclData.forEach(item => {
          aclMap.set(item.spaceId, item.permissions);
        });
        setSpaceAclMap(aclMap);

        // 构建绑定矩阵
        const matrix: Record<string, Record<string, string>> = {};
        BUILTIN_ROLES.forEach(role => {
          matrix[role.code] = {};
        });

        aclData.forEach(spaceAcl => {
          spaceAcl.permissions.forEach(entry => {
            if (entry.accessorType === 'ROLE' && matrix[entry.accessorId]) {
              matrix[entry.accessorId][spaceAcl.spaceId] = entry.permission;
            }
          });
        });

        setBindingMatrix(matrix);
      } catch (error) {
        antdMsg.error('加载权限配置失败');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [antdMsg]);

  // 更新绑定
  const updateBinding = (roleCode: string, spaceId: string, permission: string) => {
    setBindingMatrix(prev => ({
      ...prev,
      [roleCode]: {
        ...prev[roleCode],
        [spaceId]: permission,
      },
    }));
  };

  // 收集所有叶子节点 spaceId
  const collectSpaceIds = (nodes: KnowledgeSpaceTreeNode[]): string[] => {
    const ids: string[] = [];
    const traverse = (nodes: KnowledgeSpaceTreeNode[]) => {
      nodes.forEach(node => {
        if (!node.children?.length) {
          ids.push(node.id);
        } else {
          traverse(node.children);
        }
      });
    };
    traverse(nodes);
    return ids;
  };

  // 保存所有绑定
  const handleSave = async () => {
    try {
      setSaving(true);

      // 获取所有叶子空间
      const allSpaceIds = collectSpaceIds(spaceTree);

      // 对每个空间构建 ACL 条目
      for (const spaceId of allSpaceIds) {
        const entries: SpaceAclEntry[] = [];

        BUILTIN_ROLES.forEach(role => {
          const permission = bindingMatrix[role.code]?.[spaceId] as 'READ' | 'WRITE' | 'ADMIN' | undefined;
          if (permission) {
            entries.push({
              accessorType: 'ROLE',
              accessorId: role.code,
              permission,
            });
          }
        });

        await updateSpaceAcl(spaceId, entries);
      }

      antdMsg.success('权限配置已保存');
    } catch (error) {
      antdMsg.error('保存失败，请重试');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // 重置为当前保存的状态
  const handleReset = async () => {
    try {
      setLoading(true);
      const aclData = await getAllSpaceAcl();

      const matrix: Record<string, Record<string, string>> = {};
      BUILTIN_ROLES.forEach(role => {
        matrix[role.code] = {};
      });

      aclData.forEach(spaceAcl => {
        spaceAcl.permissions.forEach(entry => {
          if (entry.accessorType === 'ROLE' && matrix[entry.accessorId]) {
            matrix[entry.accessorId][spaceAcl.spaceId] = entry.permission;
          }
        });
      });

      setBindingMatrix(matrix);
      antdMsg.success('已重置为当前配置');
    } catch {
      antdMsg.error('重置失败');
    } finally {
      setLoading(false);
    }
  };

  // 递归渲染树形选择器
  const renderSpaceTree = (nodes: KnowledgeSpaceTreeNode[], depth = 0): React.ReactNode => {
    return nodes.map(node => (
      <div key={node.id} style={{ marginLeft: depth * 20 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: depth > 0 ? 'var(--color-bg-elevated)' : undefined,
          borderRadius: 8,
          marginBottom: 4,
        }}>
          <Text strong style={{ minWidth: 120 }}>{node.name}</Text>
          {BUILTIN_ROLES.map(role => (
            <Select
              key={role.code}
              size="small"
              value={bindingMatrix[role.code]?.[node.id] || undefined}
              onChange={(val) => updateBinding(role.code, node.id, val)}
              style={{ width: 90 }}
              allowClear
              placeholder="无"
              options={PERMISSION_OPTIONS.map(p => ({
                label: p.label,
                value: p.value,
              }))}
            />
          ))}
        </div>
        {node.children?.length > 0 && (
          <div style={{ marginLeft: 12 }}>
            {renderSpaceTree(node.children, depth + 1)}
          </div>
        )}
      </div>
    ));
  };

  if (loading) {
    return (
      <AppLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
          <Spin size="large" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ marginBottom: 24 }}>
        <Space>
          <SafetyOutlined style={{ fontSize: 22, color: 'var(--color-primary)' }} />
          <Title level={4} style={{ margin: 0 }}>权限管理</Title>
        </Space>
      </div>

      <Alert
        message="角色-空间权限绑定"
        description="在此页面为内置角色配置对各知识空间的访问权限。更新后会自动级联到该空间下所有文档的访问控制列表。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* 角色图例 */}
        <Card size="small">
          <Space wrap>
            <Text type="secondary">角色：</Text>
            {BUILTIN_ROLES.map(role => (
              <Tag key={role.code} color={role.color}>{role.name}</Tag>
            ))}
          </Space>
        </Card>

        {/* 权限矩阵 */}
        <Card
          title="知识空间权限配置"
          extra={
            <Space>
              <Button
                icon={<SyncOutlined />}
                size="small"
                onClick={handleReset}
              >
                重置
              </Button>
              <Popconfirm
                title="确认保存权限配置？"
                description="更新会级联到该空间下所有文档的访问控制列表"
                onConfirm={handleSave}
                okText="确认"
                cancelText="取消"
              >
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                >
                  保存配置
                </Button>
              </Popconfirm>
            </Space>
          }
        >
          {/* 表头 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            background: 'var(--color-bg-container)',
            borderRadius: 8,
            marginBottom: 8,
            fontWeight: 600,
          }}>
            <Text style={{ minWidth: 120 }}>知识空间</Text>
            {BUILTIN_ROLES.map(role => (
              <Text key={role.code} style={{ width: 90, textAlign: 'center' }}>
                {role.name}
              </Text>
            ))}
          </div>

          {/* 权限配置树 */}
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {renderSpaceTree(spaceTree)}
          </div>
        </Card>

        {/* 权限说明 */}
        <Card title="权限说明" size="small">
          <Space direction="vertical" size={8}>
            {PERMISSION_OPTIONS.map(p => (
              <div key={p.value} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Tag color={p.color} style={{ width: 60, textAlign: 'center' }}>{p.label}</Tag>
                <Text type="secondary">
                  {p.value === 'READ' && '可检索、可引用文档内容'}
                  {p.value === 'WRITE' && '可上传、可编辑文档元数据'}
                  {p.value === 'ADMIN' && '可管理空间配置、可删除空间'}
                </Text>
              </div>
            ))}
          </Space>
        </Card>
      </Space>
    </AppLayout>
  );
}
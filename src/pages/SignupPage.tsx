import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Alert, Typography } from 'antd';
import { ThunderboltFilled, MailOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { apiSignup } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const { Text } = Typography;

export default function SignupPage() {
  const navigate         = useNavigate();
  const { setAuth }      = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleSubmit = async (values: { name: string; email: string; password: string; confirm: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiSignup(values.name, values.email, values.password);
      setAuth(res.token, { id: res.id, email: res.email, name: res.name });
      navigate('/', { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0d1e 0%, #13112b 60%, #1a1535 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
            marginBottom: 14,
          }}>
            <ThunderboltFilled style={{ color: '#fff', fontSize: 24 }} />
          </div>
          <div>
            <Text style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 24, letterSpacing: '-0.5px', display: 'block', lineHeight: 1.2 }}>
              Minerva
            </Text>
            <Text style={{ color: '#475569', fontSize: 12, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Decision Engine
            </Text>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          padding: '36px 32px',
          backdropFilter: 'blur(12px)',
        }}>
          <Text style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 20, display: 'block', marginBottom: 6 }}>
            Create your account
          </Text>
          <Text style={{ color: '#64748b', fontSize: 13, display: 'block', marginBottom: 28 }}>
            Get started with Minerva
          </Text>

          {error && (
            <Alert
              type="error"
              message={error}
              showIcon
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: 20, borderRadius: 8 }}
            />
          )}

          <Form layout="vertical" onFinish={handleSubmit} requiredMark={false} size="large">
            <Form.Item
              name="name"
              rules={[{ required: true, message: 'Name is required' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#475569' }} />}
                placeholder="Full name"
                style={{ borderRadius: 8, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#f1f5f9' }}
              />
            </Form.Item>

            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email' },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#475569' }} />}
                placeholder="Email address"
                style={{ borderRadius: 8, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#f1f5f9' }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: 'Password is required' },
                { min: 8, message: 'Password must be at least 8 characters' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#475569' }} />}
                placeholder="Password (min. 8 characters)"
                style={{ borderRadius: 8, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#f1f5f9' }}
              />
            </Form.Item>

            <Form.Item
              name="confirm"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Please confirm your password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error('Passwords do not match'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#475569' }} />}
                placeholder="Confirm password"
                style={{ borderRadius: 8, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#f1f5f9' }}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{
                  borderRadius: 8, height: 44, fontWeight: 600, fontSize: 14,
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  border: 'none',
                  boxShadow: '0 2px 12px rgba(99,102,241,0.4)',
                }}
              >
                Create account
              </Button>
            </Form.Item>
          </Form>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Text style={{ color: '#475569', fontSize: 13 }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#6366f1', fontWeight: 600 }}>
              Sign in
            </Link>
          </Text>
        </div>

      </div>
    </div>
  );
}

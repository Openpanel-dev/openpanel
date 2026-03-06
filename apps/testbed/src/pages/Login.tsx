import { useState } from 'react';
import type { Group, User } from '../types';

export const PRESET_GROUPS: Group[] = [
  {
    type: 'company',
    id: 'grp_acme',
    name: 'Acme Corp',
    properties: { plan: 'enterprise' },
  },
  {
    type: 'company',
    id: 'grp_globex',
    name: 'Globex',
    properties: { plan: 'pro' },
  },
  {
    type: 'company',
    id: 'grp_initech',
    name: 'Initech',
    properties: { plan: 'pro' },
  },
  {
    type: 'company',
    id: 'grp_umbrella',
    name: 'Umbrella Ltd',
    properties: { plan: 'enterprise' },
  },
  {
    type: 'company',
    id: 'grp_stark',
    name: 'Stark Industries',
    properties: { plan: 'enterprise' },
  },
  {
    type: 'company',
    id: 'grp_wayne',
    name: 'Wayne Enterprises',
    properties: { plan: 'pro' },
  },
  {
    type: 'company',
    id: 'grp_dunder',
    name: 'Dunder Mifflin',
    properties: { plan: 'free' },
  },
  {
    type: 'company',
    id: 'grp_pied',
    name: 'Pied Piper',
    properties: { plan: 'free' },
  },
  {
    type: 'company',
    id: 'grp_hooli',
    name: 'Hooli',
    properties: { plan: 'pro' },
  },
  {
    type: 'company',
    id: 'grp_vandelay',
    name: 'Vandelay Industries',
    properties: { plan: 'free' },
  },
];

const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank', 'Iris', 'Jack'];
const LAST_NAMES = ['Smith', 'Jones', 'Brown', 'Taylor', 'Wilson', 'Davis', 'Clark', 'Hall', 'Lewis', 'Young'];

function randomMock(): User {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const id = Math.random().toString(36).slice(2, 8);
  return {
    id: `usr_${id}`,
    firstName: first,
    lastName: last,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
    groupIds: [],
  };
}

type Props = {
  onLogin: (user: User) => void;
};

export function LoginPage({ onLogin }: Props) {
  const [form, setForm] = useState<User>(randomMock);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onLogin(form);
  }

  function set(field: keyof User, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleGroup(id: string) {
    setForm((prev) => ({
      ...prev,
      groupIds: prev.groupIds.includes(id)
        ? prev.groupIds.filter((g) => g !== id)
        : [...prev.groupIds, id],
    }));
  }

  return (
    <div>
      <div className="page-title">Login</div>
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="id">
            User ID
          </label>
          <input
            id="id"
            onChange={(e) => set('id', e.target.value)}
            required
            value={form.id}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="firstName">
            First name
          </label>
          <input
            id="firstName"
            onChange={(e) => set('firstName', e.target.value)}
            required
            value={form.firstName}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="lastName">
            Last name
          </label>
          <input
            id="lastName"
            onChange={(e) => set('lastName', e.target.value)}
            required
            value={form.lastName}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            onChange={(e) => set('email', e.target.value)}
            required
            type="email"
            value={form.email}
          />
        </div>

        <div className="form-group">
          <div className="form-label" style={{ marginBottom: 8 }}>
            Groups (optional)
          </div>
          <div className="group-picker">
            {PRESET_GROUPS.map((group) => {
              const selected = form.groupIds.includes(group.id);
              return (
                <button
                  className={selected ? 'primary' : ''}
                  key={group.id}
                  onClick={() => toggleGroup(group.id)}
                  type="button"
                >
                  {group.name}
                  <span className="group-plan">{group.plan}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button className="primary" style={{ width: '100%' }} type="submit">
          Login
        </button>
      </form>
    </div>
  );
}

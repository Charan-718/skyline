import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventAssistant } from './EventAssistant';
import { eventsApi } from '../api/endpoints';

let mockUser = null;
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../api/endpoints', () => ({ eventsApi: { assistant: jest.fn(), askAssistant: jest.fn() } }));

const config = (freeText) => ({
  eventTitle: 'Robotics Night',
  freeText,
  suggestions: [
    { intent: 'PRICES', label: 'How much is a ticket?' },
    { intent: 'SEATS', label: 'How many seats are left?' },
  ],
});

function renderAssistant() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/events/e1']}>
        <EventAssistant eventId="e1" eventTitle="Robotics Night" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockUser = null;
  sessionStorage.clear();
  jest.clearAllMocks();
});

test('the launcher opens the panel with suggested questions; a chip sends its intent', async () => {
  eventsApi.assistant.mockResolvedValue(config({ available: true, requiresSignIn: true, signedIn: false }));
  eventsApi.askAssistant.mockResolvedValue({ answer: 'Member price: ₹100.', inScope: true, source: 'FACTS' });
  renderAssistant();
  await userEvent.click(screen.getByRole('button', { name: /ask about this event/i }));
  expect(screen.getByRole('dialog', { name: /assistant for robotics night/i })).toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: 'How much is a ticket?' }));
  await waitFor(() => expect(eventsApi.askAssistant).toHaveBeenCalledWith('e1', { intent: 'PRICES' }));
  expect(await screen.findByText('Member price: ₹100.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login?next=%2Fevents%2Fe1');
  expect(screen.queryByLabelText('Your question')).not.toBeInTheDocument();
});

test('signed-in users can type; prior turns are sent as history; answers render as plain text', async () => {
  mockUser = { id: 'u1' };
  eventsApi.assistant.mockResolvedValue(config({ available: true, requiresSignIn: true, signedIn: true }));
  eventsApi.askAssistant
    .mockResolvedValueOnce({ answer: '<b>6 pm</b> at Main Hall', inScope: true, source: 'AI' })
    .mockResolvedValueOnce({ answer: 'Yes, 20 seats left.', inScope: true, source: 'AI' });
  renderAssistant();
  await userEvent.click(screen.getByRole('button', { name: /ask about this event/i }));
  const input = await screen.findByLabelText('Your question');
  await userEvent.type(input, 'When does it start?{enter}');
  await waitFor(() => expect(eventsApi.askAssistant).toHaveBeenLastCalledWith('e1', { message: 'When does it start?', history: [] }));
  expect(await screen.findByText('<b>6 pm</b> at Main Hall')).toBeInTheDocument();
  await userEvent.type(input, 'Any seats?{enter}');
  await waitFor(() =>
    expect(eventsApi.askAssistant).toHaveBeenLastCalledWith('e1', {
      message: 'Any seats?',
      history: [
        { role: 'user', text: 'When does it start?' },
        { role: 'assistant', text: '<b>6 pm</b> at Main Hall' },
      ],
    }),
  );
  await screen.findByText('Yes, 20 seats left.');
});

test('errors are shown in the chat; without a Gemini key typing is hidden but chips still work', async () => {
  mockUser = { id: 'u1' };
  eventsApi.assistant.mockResolvedValue(config({ available: false, requiresSignIn: true, signedIn: true }));
  eventsApi.askAssistant.mockRejectedValue(Object.assign(new Error('The assistant cannot answer right now.'), { code: 'ASSISTANT_UNAVAILABLE' }));
  renderAssistant();
  await userEvent.click(screen.getByRole('button', { name: /ask about this event/i }));
  expect(await screen.findByText(/typed questions are not available/i)).toBeInTheDocument();
  expect(screen.queryByLabelText('Your question')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'How many seats are left?' }));
  expect(await screen.findByText('The assistant cannot answer right now.')).toBeInTheDocument();
});

test('the conversation survives a remount for the same user, and another user does not see it', async () => {
  mockUser = { id: 'u1' };
  eventsApi.assistant.mockResolvedValue(config({ available: false, requiresSignIn: true, signedIn: true }));
  eventsApi.askAssistant.mockResolvedValue({ answer: '12 seats left.', inScope: true, source: 'FACTS' });
  const view = renderAssistant();
  await userEvent.click(screen.getByRole('button', { name: /ask about this event/i }));
  await userEvent.click(await screen.findByRole('button', { name: 'How many seats are left?' }));
  await screen.findByText('12 seats left.');
  view.unmount();

  renderAssistant();
  await userEvent.click(screen.getByRole('button', { name: /ask about this event/i }));
  expect(screen.getByText('12 seats left.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /close assistant/i }));
  expect(await screen.findByRole('button', { name: /ask about this event/i })).toBeInTheDocument();

  mockUser = { id: 'u2' };
  renderAssistant();
  const launchers = screen.getAllByRole('button', { name: /ask about this event/i });
  await userEvent.click(launchers[launchers.length - 1]);
  expect(screen.queryAllByText('12 seats left.')).toHaveLength(0);
});

import Parent from '../models/parent.model';
import { sendWhatsAppMessage } from '../utils/whatsapp';

const HELP = 'Minhaj Platform\n1. Attendance\n2. Fees\n3. Results\n4. Assignments\n5. Exams\n\nReply with a number, or type HELP.';

export async function handleParentBotMessage(input: { organizationId: string; from: string; text: string; parentId?: string }) {
  const text = input.text.trim().toLowerCase();
  if (!text || text === 'help' || text === 'menu' || text === 'hi' || text === 'hello' || text === '0') {
    await sendWhatsAppMessage({ to: input.from, text: HELP, organizationId: input.organizationId });
    return { handled: true, action: 'menu' };
  }
  const parent = input.parentId ? await Parent.findById(input.parentId).lean() : null;
  if (!parent) {
    await sendWhatsAppMessage({ to: input.from, text: 'We could not link this WhatsApp number to a parent account. Please contact your institution administrator.', organizationId: input.organizationId });
    return { handled: true, action: 'unlinked' };
  }
  const replies: Record<string, string> = {
    '1': 'Attendance self-service is connected. Your institution can provide the latest attendance report from the Minhaj Platform.',
    '2': 'Fees self-service is connected. Your institution can provide your current invoice and payment status.',
    '3': 'Results self-service is connected. Your institution can provide your latest published results.',
    '4': 'Assignments self-service is connected. Your institution can provide your current assignments.',
    '5': 'Exams self-service is connected. Your institution can provide your upcoming exam schedule.',
  };
  const reply = replies[text] || 'I did not understand that command. Reply MENU to see the available options.';
  await sendWhatsAppMessage({ to: input.from, text: reply, organizationId: input.organizationId });
  return { handled: true, action: text in replies ? `menu:${text}` : 'unknown' };
}

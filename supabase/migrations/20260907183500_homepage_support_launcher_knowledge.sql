update public.knowledge_base
set
  approved_answer = 'The Rewear support launcher is visible on the public homepage. Signed-out visitors can open it to see how to access support, but they must sign in before starting a secure AI or human-support conversation. After sign-in, the same support chat is available across the customer experience and is connected to that authenticated customer account. The assistant may answer approved Rewear questions and read limited status information only from the signed-in customer''s own account. Customers can request a human support agent, and sensitive or unresolved issues are routed to human support.',
  question_examples = array['Where is the chat?','Is chat on the homepage?','Can I use chat before signing in?','Why do I need to sign in for chat?','Can I talk to a human?','How do I contact support?','Le chat est-il sur la page d''accueil ?']::text[],
  tags = array['chat','support chat','homepage','sign in','logged in','human support','talk to human','authenticated chat']::text[],
  updated_at = now()
where title = 'Support chat access and human help'
  and status = 'approved';

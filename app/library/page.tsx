// app/library/page.tsx
import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function Library() {
    const { userId } = await auth();
    if (!userId) return <p className="p-8">Please sign in to view your library.</p>;

    const { data, error } = await supabase
        .from('user_answers')
        .select('*')
        .eq('clerk_user_id', userId)
        .order('created_at', { ascending: false });

    if (error) return <p className="p-8 text-red-600">Error: {error.message}</p>;

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Your Mortgage Library</h1>
            {data?.length === 0 ? (
                <p>No saved answers yet. Ask Grok a question!</p>
            ) : (
                <div className="space-y-4">
                    {data?.map((a) => (
                        <details key={a.id} className="border rounded-lg p-4 bg-white shadow-sm">
                            <summary className="font-semibold text-lg cursor-pointer text-blue-700">
                                {a.question}
                            </summary>
                            <div className="mt-3 p-4 bg-gray-50 rounded">
                                <p className="font-medium mb-2">Answer:</p>
                                <p className="whitespace-pre-wrap">{a.answer.answer}</p>
                                {a.answer.next_step && (
                                    <>
                                        <p className="font-medium mt-4">Next Step:</p>
                                        <p>{a.answer.next_step}</p>
                                    </>
                                )}
                                {a.answer.follow_up && (
                                    <>
                                        <p className="font-medium mt-4">Follow Up:</p>
                                        <p>{a.answer.follow_up}</p>
                                    </>
                                )}
                            </div>
                        </details>
                    ))}
                </div>
            )}
        </div>
    );
}
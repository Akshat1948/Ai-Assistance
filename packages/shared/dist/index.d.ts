export interface User {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
}
export interface Chat {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}
export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
}

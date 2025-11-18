import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface CustomerMessagesProps {
  customer: {
    id: string;
    name: string;
    email: string;
  };
}

interface Conversation {
  id: string;
  vendorName: string;
  vendorServiceType: string;
  eventName: string;
  eventDate: string;
  lastMessage: {
    text: string;
    sender: "customer" | "vendor";
    timestamp: string;
  };
  unread: number;
}

interface Message {
  id: string;
  text: string;
  sender: "customer" | "vendor";
  timestamp: string;
}

// Mock data - TODO: Replace with real API data
const mockConversations: Conversation[] = [
  {
    id: "1",
    vendorName: "Elegant Photos",
    vendorServiceType: "Photography",
    eventName: "Sarah's Wedding",
    eventDate: "2025-06-15",
    lastMessage: {
      text: "I'd be happy to discuss package options with you!",
      sender: "vendor",
      timestamp: new Date().toISOString(),
    },
    unread: 2,
  },
  {
    id: "2",
    vendorName: "Gourmet Catering Co.",
    vendorServiceType: "Catering",
    eventName: "Sarah's Wedding",
    eventDate: "2025-06-15",
    lastMessage: {
      text: "Thank you for your inquiry about our catering services.",
      sender: "vendor",
      timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    },
    unread: 0,
  },
];

const mockMessages: { [key: string]: Message[] } = {
  "1": [
    {
      id: "m1",
      text: "Hi! I'm interested in booking photography for my wedding on June 15th.",
      sender: "customer",
      timestamp: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "m2",
      text: "Hello! Thank you for reaching out. I'd love to help capture your special day!",
      sender: "vendor",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "m3",
      text: "What packages do you offer?",
      sender: "customer",
      timestamp: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: "m4",
      text: "I'd be happy to discuss package options with you!",
      sender: "vendor",
      timestamp: new Date().toISOString(),
    },
  ],
};

export default function CustomerMessages({ customer }: CustomerMessagesProps) {
  const [conversations] = useState<Conversation[]>(mockConversations);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(
    conversations[0] || null
  );
  const [messageText, setMessageText] = useState("");

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    // TODO: Send message via API
    setMessageText("");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-messages-title">
          Messages
        </h1>
        <p className="text-muted-foreground mt-1">
          Chat with vendors about your events
        </p>
      </div>

      <div className="grid md:grid-cols-[350px_1fr] gap-6">
        {/* Conversations List */}
        <Card className="rounded-xl shadow-sm h-[600px] flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Conversations</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search messages..."
                className="pl-9"
                data-testid="input-search-messages"
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2 p-4 pt-0">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={cn(
                  "w-full text-left p-3 rounded-lg hover-elevate transition-colors",
                  selectedConversation?.id === conversation.id && "bg-card shadow-sm"
                )}
                data-testid={`conversation-${conversation.id}`}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(conversation.vendorName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium truncate">{conversation.vendorName}</p>
                      {conversation.unread > 0 && (
                        <Badge className="bg-primary text-primary-foreground">
                          {conversation.unread}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {conversation.vendorServiceType}
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      For: {conversation.eventName}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {conversation.lastMessage.text}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(conversation.lastMessage.timestamp), "MMM d, h:mm a")}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Message Thread */}
        <Card className="rounded-xl shadow-sm h-[600px] flex flex-col">
          {selectedConversation ? (
            <>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(selectedConversation.vendorName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium" data-testid="text-selected-vendor">
                      {selectedConversation.vendorName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedConversation.vendorServiceType} • {selectedConversation.eventName}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
                {mockMessages[selectedConversation.id]?.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.sender === "customer" ? "justify-end" : "justify-start"
                    )}
                    data-testid={`message-${message.id}`}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] rounded-2xl px-4 py-2",
                        message.sender === "customer"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary"
                      )}
                    >
                      <p className="text-sm">{message.text}</p>
                      <p
                        className={cn(
                          "text-xs mt-1",
                          message.sender === "customer"
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        )}
                      >
                        {format(new Date(message.timestamp), "h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    data-testid="input-message"
                  />
                  <Button
                    onClick={handleSendMessage}
                    size="icon"
                    data-testid="button-send-message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p>Select a conversation to view messages</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

import * as React from "react";
import { Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

type EventDay = {
  date: Date;
  startTime: string;
  endTime: string;
};

interface MultiDayEventProps {
  value: EventDay[];
  onChange: (days: EventDay[]) => void;
}

export function MultiDayEvent({ value, onChange }: MultiDayEventProps) {
  const addDay = () => {
    onChange([...value, { date: new Date(), startTime: "09:00", endTime: "17:00" }]);
  };

  const removeDay = (index: number) => {
    const newDays = [...value];
    newDays.splice(index, 1);
    onChange(newDays);
  };

  const updateDay = (index: number, field: keyof EventDay, newValue: any) => {
    const newDays = [...value];
    newDays[index] = { ...newDays[index], [field]: newValue };
    onChange(newDays);
  };

  return (
    <div className="space-y-4">
      {value.map((day, index) => (
        <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end p-4 border rounded-lg">
          <div className="space-y-2">
            <Label htmlFor={`day-${index}-date`}>Day {index + 1} Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  id={`day-${index}-date`}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {day.date ? format(day.date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <CalendarComponent
                  mode="single"
                  selected={day.date}
                  onSelect={(date) => date && updateDay(index, "date", date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`day-${index}-start`}>Start Time</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id={`day-${index}-start`}
                type="time"
                value={day.startTime}
                onChange={(e) => updateDay(index, "startTime", e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`day-${index}-end`}>End Time</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id={`day-${index}-end`}
                type="time"
                value={day.endTime}
                onChange={(e) => updateDay(index, "endTime", e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => removeDay(index)}
            >
              Remove day
            </Button>
          </div>
        </div>
      ))}
      
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={addDay}
      >
        Add another day
      </Button>
    </div>
  );
}

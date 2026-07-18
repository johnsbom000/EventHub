import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Label,
  Checkbox,
  Slider,
} from "eventhub-ui";

// Sheet forced open so the portalled panel renders in the card.
export const FiltersPanel = () => (
  <Sheet open>
    <SheetContent side="right">
      <SheetHeader>
        <SheetTitle>Filter vendors</SheetTitle>
        <SheetDescription>
          Narrow results near Salt Lake City for June 14, 2026.
        </SheetDescription>
      </SheetHeader>
      <div className="mt-6 space-y-6">
        <div className="space-y-3">
          <Label>Category</Label>
          <div className="flex items-center gap-2">
            <Checkbox id="florists" defaultChecked />
            <Label htmlFor="florists" className="font-normal">Florists</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="catering" defaultChecked />
            <Label htmlFor="catering" className="font-normal">Catering</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="photo" />
            <Label htmlFor="photo" className="font-normal">Photography</Label>
          </div>
        </div>
        <div className="space-y-3">
          <Label>Price per event — up to $4,500</Label>
          <Slider defaultValue={[4500]} min={500} max={8000} step={100} />
        </div>
        <div className="space-y-3">
          <Label>Distance — within 25 mi</Label>
          <Slider defaultValue={[25]} min={5} max={100} step={5} />
        </div>
      </div>
      <SheetFooter className="mt-8">
        <Button variant="outline">Reset</Button>
        <Button>Apply filters</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

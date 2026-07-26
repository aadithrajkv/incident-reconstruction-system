from pptx import Presentation
from pptx.util import Inches
from pathlib import Path

PPTX_PATH = Path("reports/project_presentation.pptx")
IMG_PATH = Path("reports/analytics_screenshot.png")

def main():
    if not PPTX_PATH.exists():
        print(f"Error: {PPTX_PATH} not found.")
        return
    if not IMG_PATH.exists():
        print(f"Error: {IMG_PATH} not found.")
        return

    print("Loading presentation...")
    prs = Presentation(str(PPTX_PATH))

    # Slide 6 is index 5
    slide6 = prs.slides[5]
    print("Editing Slide 6 (Forensic Telemetry)...")
    
    # Remove the previous terminal_screenshot.png from Slide 6 if any
    # PPTX doesn't have an easy way to distinguish images by filename, but we can look for the picture shape that is on the right side (left > Inches(4.5)) and delete it
    for shape in list(slide6.shapes):
        if shape.shape_type == 13: # 13 is Picture shape type
            if shape.left > Inches(4.5):
                print("Removing previous image on Slide 6...")
                sp = shape._element
                sp.getparent().remove(sp)
            
    # Add new analytics screenshot on the right side of Slide 6
    slide6.shapes.add_picture(str(IMG_PATH), Inches(5.0), Inches(1.2), width=Inches(4.5))

    print(f"Saving presentation to {PPTX_PATH}...")
    prs.save(str(PPTX_PATH))
    print("Presentation successfully updated with analytics screenshot on Slide 6!")

if __name__ == "__main__":
    main()
